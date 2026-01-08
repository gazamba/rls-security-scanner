/**
 * Supabase Management API Client
 * Helper functions to interact with Supabase Management API
 * https://supabase.com/docs/reference/api/introduction
 */

const MANAGEMENT_API_BASE = 'https://api.supabase.com/v1'

export interface Project {
  id: string
  ref: string
  name: string
  organization_id: string
  region: string
  created_at: string
  database?: {
    host: string
    version: string
  }
  status?: string
}

export interface ApiKey {
  name: string
  api_key: string
}

export interface ProjectApiKeys {
  anon: string
  service_role: string
}

/**
 * List all projects for the authenticated user
 */
export async function listProjects(accessToken: string): Promise<Project[]> {
  const response = await fetch(`${MANAGEMENT_API_BASE}/projects`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to list projects: ${response.status} ${error}`)
  }

  return response.json()
}

/**
 * Get details for a specific project
 */
export async function getProjectDetails(
  accessToken: string,
  projectRef: string
): Promise<Project> {
  const response = await fetch(`${MANAGEMENT_API_BASE}/projects/${projectRef}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get project details: ${response.status} ${error}`)
  }

  return response.json()
}

/**
 * Get API keys for a project
 * Returns anon and service_role keys needed for scanning
 */
export async function getProjectApiKeys(
  accessToken: string,
  projectRef: string
): Promise<ProjectApiKeys> {
  const response = await fetch(`${MANAGEMENT_API_BASE}/projects/${projectRef}/api-keys`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get project API keys: ${response.status} ${error}`)
  }

  const keys: ApiKey[] = await response.json()

  // Extract anon and service_role keys
  const anonKey = keys.find(k => k.name === 'anon')?.api_key
  const serviceRoleKey = keys.find(k => k.name === 'service_role')?.api_key

  if (!anonKey || !serviceRoleKey) {
    throw new Error('Could not find required API keys (anon and service_role)')
  }

  return {
    anon: anonKey,
    service_role: serviceRoleKey,
  }
}

/**
 * Get project URL from project ref
 */
export function getProjectUrl(projectRef: string): string {
  return `https://${projectRef}.supabase.co`
}

/**
 * Execute a SQL query on a project
 * Note: This requires proper authentication and permissions
 */
export async function executeQuery(
  accessToken: string,
  projectRef: string,
  query: string
): Promise<any> {
  const response = await fetch(`${MANAGEMENT_API_BASE}/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`❌ [Management API] Query failed: ${response.status} ${error}`, { query })
    throw new Error(`Failed to execute query: ${response.status} ${error}`)
  }

  const result = await response.json()
  console.log(`✅ [Management API] Query success:`, { result_count: result.length })
  return result
}

/**
 * Test if access token is valid by attempting to list projects
 */
export async function testAccessToken(accessToken: string): Promise<boolean> {
  try {
    await listProjects(accessToken)
    return true
  } catch (error) {
    console.error('Access token validation failed:', error)
    return false
  }
}

