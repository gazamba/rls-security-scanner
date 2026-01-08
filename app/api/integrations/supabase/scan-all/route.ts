import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST - Trigger scans for all user's projects
 * This is called after OAuth connection to scan all projects in background
 */

export async function POST(request: NextRequest) {
  try {
    const { user_id } = await request.json()
    
    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      )
    }
    
    // Use service role to get projects
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Get all user's projects that need scanning (pending status)
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, project_name, scan_status')
      .eq('user_id', user_id)
      .eq('scan_status', 'pending')
    
    if (projectsError) {
      console.error('Failed to fetch projects:', projectsError)
      return NextResponse.json(
        { error: 'Failed to fetch projects' },
        { status: 500 }
      )
    }
    
    if (!projects || projects.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No projects to scan',
        scans_triggered: 0,
      })
    }
    
    // Trigger scans for each project asynchronously
    // In production, you'd want to use a proper job queue (e.g., BullMQ, Inngest, etc.)
    // For now, we'll trigger them via fetch and let them run in background
    const scanPromises = projects.map(async (project) => {
      try {
        // Don't await the scan, let it run in background
        fetch(`${request.nextUrl.origin}/api/integrations/supabase/scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ project_id: project.id, user_id }),
        }).catch(error => {
          console.error(`Failed to trigger scan for ${project.project_name}:`, error)
        })
        
        return { project_id: project.id, triggered: true }
      } catch (error) {
        console.error(`Error triggering scan for ${project.project_name}:`, error)
        return { project_id: project.id, triggered: false, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    })
    
    // Wait for all scan triggers (not the scans themselves)
    const results = await Promise.all(scanPromises)
    const successCount = results.filter(r => r.triggered).length
    
    return NextResponse.json({
      success: true,
      message: `Triggered scans for ${successCount} projects`,
      scans_triggered: successCount,
      total_projects: projects.length,
      results,
    })
    
  } catch (error) {
    console.error('Error triggering scans:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

