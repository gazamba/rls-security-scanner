import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Disconnect Supabase Integration
 * Removes OAuth tokens and all associated projects/scans
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
    
    // Use service role to delete integration
    // This will cascade delete projects and scan_results
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { error: deleteError } = await serviceSupabase
      .from('integrations')
      .delete()
      .eq('user_id', user_id)
      .eq('provider', 'supabase')
    
    if (deleteError) {
      console.error('Failed to disconnect integration:', deleteError)
      return NextResponse.json(
        { error: 'Failed to disconnect integration' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: 'Successfully disconnected Supabase integration'
    })
  } catch (error) {
    console.error('Disconnect error:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    )
  }
}

