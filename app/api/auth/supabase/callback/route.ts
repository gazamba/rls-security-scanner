import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { encrypt } from '@/lib/encryption'

/**
 * OAuth Callback Endpoint
 * Exchanges authorization code for access tokens
 * Stores tokens and fetches user's projects
 */

const SUPABASE_OAUTH_TOKEN_URL = 'https://api.supabase.com/v1/oauth/token'
const SUPABASE_MANAGEMENT_API = 'https://api.supabase.com/v1'

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

interface Project {
  id: string
  ref: string
  name: string
  organization_id: string
  region: string
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    
    // Handle OAuth errors
    if (error) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}/?error=${encodeURIComponent(error)}`
      )
    }
    
    if (!code || !state) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}/?error=missing_code_or_state`
      )
    }
    
    // Retrieve and validate stored state
    const storedState = request.cookies.get('oauth_state')?.value
    const codeVerifier = request.cookies.get('oauth_code_verifier')?.value
    
    if (!storedState || !codeVerifier) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}/?error=missing_session_data`
      )
    }
    
    if (state !== storedState) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}/?error=state_mismatch`
      )
    }
    
    // Exchange code for tokens
    const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID!
    const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET!
    const redirectUri = `${request.nextUrl.origin}/api/auth/supabase/callback`
    
    const tokenResponse = await fetch(SUPABASE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    })
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Token exchange failed:', errorText)
      return NextResponse.redirect(
        `${request.nextUrl.origin}/?error=token_exchange_failed`
      )
    }
    
    const tokens: TokenResponse = await tokenResponse.json()
    
    // Extract user_id from state
    let userId: string
    try {
      const stateData = JSON.parse(Buffer.from(storedState, 'base64url').toString())
      userId = stateData.user_id
      
      if (!userId) {
        throw new Error('No user_id in state')
      }
    } catch (error) {
      console.error('Failed to extract user_id from state:', error)
      return NextResponse.redirect(
        `${request.nextUrl.origin}/?error=invalid_state&message=${encodeURIComponent('Session expired. Please try again.')}`
      )
    }
    
    // Get cookie store for service role operations
    const cookieStore = await cookies()
    
    // Encrypt tokens before storage
    const encryptedAccessToken = encrypt(tokens.access_token)
    const encryptedRefreshToken = encrypt(tokens.refresh_token)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    
    // Create service role client to insert data
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
    
    // Store integration (upsert to handle reconnection)
    const { data: integration, error: integrationError } = await serviceSupabase
      .from('integrations')
      .upsert({
        user_id: userId,
        provider: 'supabase',
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      })
      .select()
      .single()
    
    if (integrationError) {
      console.error('Failed to store integration:', integrationError)
      return NextResponse.redirect(
        `${request.nextUrl.origin}/?error=failed_to_store_integration`
      )
    }
    
    // Don't fetch projects yet - just redirect to homepage
    // Projects will be fetched when user opens the selection modal
    
    // Clear OAuth cookies
    const response = NextResponse.redirect(
      `${request.nextUrl.origin}/?connected=true&integration_id=${integration.id}`
    )
    response.cookies.delete('oauth_state')
    response.cookies.delete('oauth_code_verifier')
    
    return response
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(
      `${request.nextUrl.origin}/?error=callback_failed`
    )
  }
}

