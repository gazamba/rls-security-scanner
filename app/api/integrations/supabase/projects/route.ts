import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '@/lib/supabase-oauth'
import { listProjects } from '@/lib/supabase-management-api'

/**
 * GET - List user's Supabase projects from database
 * POST - Refresh projects from Management API and update database
 */

export async function GET(request: NextRequest) {
  try {
    // Get user_id from query parameter
    const userId = request.nextUrl.searchParams.get('user_id')

    if (!userId) {
      return NextResponse.json(
        { error: 'Not authenticated', success: false },
        { status: 401 }
      )
    }

    // Create service client to fetch projects
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch projects from database with latest scan results including vulnerabilities
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select(`
        *,
        scan_results (
          id,
          scan_date,
          vulnerabilities_found,
          summary,
          vulnerabilities,
          ai_insights,
          details,
          created_at
        )
      `)
      .order('scan_date', { foreignTable: 'scan_results', ascending: false })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (projectsError) {
      console.error('Failed to fetch projects:', projectsError)
      return NextResponse.json(
        { error: 'Failed to fetch projects' },
        { status: 500 }
      )
    }

    // Format response with latest scan result per project
    const formattedProjects = projects.map(project => ({
      ...project,
      latest_scan: project.scan_results?.[0] || null,
      scan_results: undefined, // Remove the array, only keep latest
    }))

    return NextResponse.json({
      success: true,
      projects: formattedProjects,
    })
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user_id } = await request.json()

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      )
    }

    // Get valid access token
    const accessToken = await getValidAccessToken(user_id)

    // Fetch projects from Management API
    const managementProjects = await listProjects(accessToken)

    if (managementProjects.length === 0) {
      return NextResponse.json({
        success: true,
        projects: [],
        message: 'No projects found',
      })
    }

    // Get user's integration
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: integration, error: integrationError } = await serviceSupabase
      .from('integrations')
      .select('id')
      .eq('user_id', user_id)
      .eq('provider', 'supabase')
      .single()

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: 'No Supabase integration found' },
        { status: 404 }
      )
    }

    // Upsert projects in database
    const projectsToUpsert = managementProjects.map(project => ({
      user_id: user_id,
      integration_id: integration.id,
      project_ref: project.ref,
      project_name: project.name,
      organization_id: project.organization_id,
      region: project.region,
      // Keep existing scan_status if project already exists
    }))

    const { data: updatedProjects, error: upsertError } = await serviceSupabase
      .from('projects')
      .upsert(projectsToUpsert, {
        onConflict: 'integration_id,project_ref',
        ignoreDuplicates: false,
      })
      .select()

    if (upsertError) {
      console.error('Failed to update projects:', upsertError)
      return NextResponse.json(
        { error: 'Failed to update projects' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      projects: updatedProjects,
      message: `Refreshed ${managementProjects.length} projects`,
    })
  } catch (error) {
    console.error('Error refreshing projects:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

