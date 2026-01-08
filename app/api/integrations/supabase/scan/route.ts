import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '@/lib/supabase-oauth'
import { getProjectApiKeys, getProjectUrl } from '@/lib/supabase-management-api'
import { scanProject } from '@/lib/scanner'

/**
 * POST - Scan a Supabase project for RLS vulnerabilities
 * Uses OAuth tokens to fetch API keys from Management API
 */

export async function POST(request: NextRequest) {
  try {
    const { project_id, user_id } = await request.json()

    if (!project_id) {
      return NextResponse.json(
        { error: 'project_id is required' },
        { status: 400 }
      )
    }

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      )
    }

    // Use service role for database operations
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get project from database
    const { data: project, error: projectError } = await serviceSupabase
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .eq('user_id', user_id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Update scan status to 'scanning'
    await serviceSupabase
      .from('projects')
      .update({
        scan_status: 'scanning',
        scan_error: null,
      })
      .eq('id', project_id)

    try {
      // Get valid access token
      const accessToken = await getValidAccessToken(user_id)

      // Fetch API keys from Management API
      const apiKeys = await getProjectApiKeys(accessToken, project.project_ref)
      const projectUrl = getProjectUrl(project.project_ref)

      // Run the scan using Management API (NO SETUP REQUIRED!)
      // Uses: POST /v1/projects/{ref}/database/query
      const scanResult = await scanProject(
        projectUrl,
        project.project_ref,
        apiKeys.service_role,
        apiKeys.anon,
        accessToken,
        {
          maxTables: 50, // Increased limit - Management API is fast!
          enableAI: true,
        }
      )

      if (!scanResult.success) {
        // Update project with error status
        await serviceSupabase
          .from('projects')
          .update({
            scan_status: 'error',
            scan_error: scanResult.error || 'Scan failed',
            last_scanned_at: new Date().toISOString(),
          })
          .eq('id', project_id)

        return NextResponse.json({
          success: false,
          error: scanResult.error,
        }, { status: 500 })
      }

      // Generate AI insights for the overall scan
      const aiInsights = scanResult.vulnerabilities.length > 0
        ? `Found ${scanResult.vulnerabilities.length} security issue(s) across ${scanResult.summary.vulnerable_tables} table(s). ` +
        `${scanResult.summary.secure_tables} table(s) are properly secured with RLS.`
        : `All ${scanResult.summary.total_tables} tables are properly secured with Row Level Security.`

      // Store scan results in database
      const { data: scanRecord, error: scanRecordError } = await serviceSupabase
        .from('scan_results')
        .insert({
          project_id: project_id,
          user_id: user_id,
          scan_date: new Date().toISOString(),
          vulnerabilities_found: scanResult.vulnerabilities.length,
          summary: scanResult.summary,
          vulnerabilities: scanResult.vulnerabilities.map(v => ({
            table: v.table,
            issue: v.issue,
            description: v.details,
            recommendation: `Enable RLS on the ${v.table} table and create appropriate policies`,
            ai_analysis: v.ai_analysis?.risk_assessment || '',
            severity: v.severity.toLowerCase(),
          })),
          ai_insights: aiInsights,
          details: {
            vulnerabilities: scanResult.vulnerabilities,
          },
        })
        .select()
        .single()

      if (scanRecordError) {
        console.error('Failed to store scan results:', scanRecordError)
      } else {
        console.log('✅ Scan Record created:', scanRecord)
      }

      // Update project status to 'completed'
      await serviceSupabase
        .from('projects')
        .update({
          scan_status: 'completed',
          last_scanned_at: new Date().toISOString(),
          scan_error: null,
        })
        .eq('id', project_id)

      return NextResponse.json({
        success: true,
        scan_result: scanRecord,
        scan_id: scanRecord?.id,
      })

    } catch (error) {
      console.error('Scan error:', error)

      // Update project with error status
      await serviceSupabase
        .from('projects')
        .update({
          scan_status: 'error',
          scan_error: error instanceof Error ? error.message : 'Unknown error',
          last_scanned_at: new Date().toISOString(),
        })
        .eq('id', project_id)

      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Scan failed',
      }, { status: 500 })
    }

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Allow longer execution time for scans
export const maxDuration = 300

