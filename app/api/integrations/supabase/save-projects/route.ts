import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getValidAccessToken } from '@/lib/supabase-oauth'
import { listProjects } from '@/lib/supabase-management-api'

/**
 * POST - Save selected projects to database
 * Body: { project_refs: string[] }
 */

export async function POST(request: NextRequest) {
  try {
    const { project_refs, user_id } = await request.json()
    
    if (!project_refs || !Array.isArray(project_refs) || project_refs.length === 0) {
      return NextResponse.json(
        { error: 'project_refs array is required' },
        { status: 400 }
      )
    }
    
    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      )
    }
    
    // Get cookie store for service role operations
    const cookieStore = await cookies()
    
    // Get valid access token and fetch all projects
    const accessToken = await getValidAccessToken(user_id)
    const allProjects = await listProjects(accessToken)
    
    // Filter to only selected projects
    const selectedProjects = allProjects.filter(p => project_refs.includes(p.ref))
    
    if (selectedProjects.length === 0) {
      return NextResponse.json(
        { error: 'No valid projects found' },
        { status: 404 }
      )
    }
    
    // Get user's integration
    const serviceSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
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
    
    // Store selected projects in database
    const projectsToInsert = selectedProjects.map(project => ({
      user_id: user_id,
      integration_id: integration.id,
      project_ref: project.ref,
      project_name: project.name,
      organization_id: project.organization_id,
      region: project.region,
      scan_status: 'pending' as const,
    }))
    
    const { data: savedProjects, error: saveError } = await serviceSupabase
      .from('projects')
      .upsert(projectsToInsert, {
        onConflict: 'integration_id,project_ref',
      })
      .select()
    
    if (saveError) {
      console.error('Failed to save projects:', saveError)
      return NextResponse.json(
        { error: 'Failed to save projects' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      projects: savedProjects,
      message: `Successfully added ${savedProjects?.length || 0} projects`,
    })
  } catch (error) {
    console.error('Error saving projects:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

