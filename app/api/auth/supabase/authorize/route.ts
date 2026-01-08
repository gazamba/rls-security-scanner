import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import crypto from 'crypto'

/**
 * OAuth Authorization Endpoint
 * Redirects user to Supabase OAuth consent screen with PKCE
 */

const SUPABASE_OAUTH_URL = 'https://api.supabase.com/v1/oauth/authorize'

/**
 * Generate a cryptographically random code verifier
 * 43-128 characters, URL-safe
 */
function generateCodeVerifier(): string {
  return crypto
    .randomBytes(32)
    .toString('base64url')
}

/**
 * Generate code challenge from verifier
 * SHA256 hash, base64url encoded
 */
function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url')
}

/**
 * Generate a random state value for CSRF protection
 */
function generateState(): string {
  return crypto
    .randomBytes(16)
    .toString('base64url')
}

export async function GET(request: NextRequest) {
  try {
    // Get user_id from query parameter (passed from client)
    const userId = request.nextUrl.searchParams.get('user_id')
    
    if (!userId) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}/?error=not_authenticated&message=${encodeURIComponent('Please sign in with Google first')}`
      )
    }
    
    const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID
    const redirectUri = `${request.nextUrl.origin}/api/auth/supabase/callback`
    
    if (!clientId) {
      return NextResponse.json(
        { error: 'OAuth not configured. Please set SUPABASE_OAUTH_CLIENT_ID' },
        { status: 500 }
      )
    }
    
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    
    // Include user_id in state for callback verification
    const stateData = {
      random: generateState(),
      user_id: userId,
    }
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64url')
    
    // Build authorization URL
    const authUrl = new URL(SUPABASE_OAUTH_URL)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    // Request necessary scopes for reading projects and their API keys
    authUrl.searchParams.set('scope', 'all')
    
    // Store code verifier and state in httpOnly cookie for security
    // These will be verified in the callback
    const response = NextResponse.redirect(authUrl.toString())
    
    // Set secure cookies (expires in 10 minutes)
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 600, // 10 minutes
      path: '/',
    }
    
    response.cookies.set('oauth_code_verifier', codeVerifier, cookieOptions)
    response.cookies.set('oauth_state', state, cookieOptions)
    
    return response
  } catch (error) {
    console.error('OAuth authorization error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow' },
      { status: 500 }
    )
  }
}

