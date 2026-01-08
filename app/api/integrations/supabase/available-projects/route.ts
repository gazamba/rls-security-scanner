import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getValidAccessToken } from '@/lib/supabase-oauth'
import { listProjects } from '@/lib/supabase-management-api'

/**
 * GET - Fetch available projects from Supabase Management API
 * (not yet stored in our database)
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
    
    // Get valid access token
    const accessToken = await getValidAccessToken(userId)
    
    // Fetch projects from Management API
    const managementProjects = await listProjects(accessToken)
    
    return NextResponse.json({
      success: true,
      projects: managementProjects,
    })
  } catch (error) {
    console.error('Error fetching available projects:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error',
        success: false,
      },
      { status: 500 }
    )
  }
}

