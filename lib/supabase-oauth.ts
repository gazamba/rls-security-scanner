import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from './encryption'

/**
 * Supabase OAuth token management
 * Handles token refresh and retrieval
 */

const SUPABASE_OAUTH_TOKEN_URL = 'https://api.supabase.com/v1/oauth/token'

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

interface Integration {
  id: string
  user_id: string
  provider: string
  access_token: string
  refresh_token: string
  token_expires_at: string
  created_at: string
  updated_at: string
}

/**
 * Get a valid access token for a user
 * Automatically refreshes if expired or expiring soon (within 5 minutes)
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Get the integration
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'supabase')
    .single<Integration>()
  
  if (error || !integration) {
    throw new Error('No Supabase integration found for user')
  }
  
  // Check if token is expired or expiring soon (within 5 minutes)
  const expiresAt = new Date(integration.token_expires_at)
  const now = new Date()
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)
  
  if (expiresAt > fiveMinutesFromNow) {
    // Token is still valid, decrypt and return
    return decrypt(integration.access_token)
  }
  
  // Token expired or expiring soon, refresh it
  const newTokens = await refreshAccessToken(integration.id)
  return newTokens.access_token
}

/**
 * Refresh an access token using the refresh token
 */
export async function refreshAccessToken(integrationId: string): Promise<TokenResponse> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Get the integration
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', integrationId)
    .single<Integration>()
  
  if (error || !integration) {
    throw new Error('Integration not found')
  }
  
  // Decrypt refresh token
  const refreshToken = decrypt(integration.refresh_token)
  
  // Exchange refresh token for new access token
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID!
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET!
  
  const response = await fetch(SUPABASE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Token refresh failed:', errorText)
    
    // If refresh fails, the integration is no longer valid
    // Delete it so user can reconnect
    await supabase
      .from('integrations')
      .delete()
      .eq('id', integrationId)
    
    throw new Error('Token refresh failed. Please reconnect your Supabase account.')
  }
  
  const tokens: TokenResponse = await response.json()
  
  // Update stored tokens
  await storeTokens(integration.user_id, tokens, integrationId)
  
  return tokens
}

/**
 * Store or update OAuth tokens for a user
 */
export async function storeTokens(
  userId: string,
  tokens: TokenResponse,
  integrationId?: string
): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Encrypt tokens
  const encryptedAccessToken = encrypt(tokens.access_token)
  const encryptedRefreshToken = encrypt(tokens.refresh_token)
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
  
  const tokenData = {
    access_token: encryptedAccessToken,
    refresh_token: encryptedRefreshToken,
    token_expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }
  
  if (integrationId) {
    // Update existing integration
    const { error } = await supabase
      .from('integrations')
      .update(tokenData)
      .eq('id', integrationId)
    
    if (error) {
      throw new Error(`Failed to update tokens: ${error.message}`)
    }
  } else {
    // Create new integration
    const { error } = await supabase
      .from('integrations')
      .upsert({
        user_id: userId,
        provider: 'supabase',
        ...tokenData,
      }, {
        onConflict: 'user_id,provider',
      })
    
    if (error) {
      throw new Error(`Failed to store tokens: ${error.message}`)
    }
  }
}

/**
 * Check if a user has a Supabase integration
 */
export async function hasIntegration(userId: string): Promise<boolean> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const { data, error } = await supabase
    .from('integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'supabase')
    .maybeSingle()
  
  return !error && data !== null
}

/**
 * Get integration for a user
 */
export async function getIntegration(userId: string): Promise<Integration | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'supabase')
    .maybeSingle<Integration>()
  
  if (error) {
    console.error('Failed to get integration:', error)
    return null
  }
  
  return data
}

