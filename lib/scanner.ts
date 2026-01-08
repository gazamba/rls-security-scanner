import { createClient, SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { executeQuery } from './supabase-management-api'

export interface Vulnerability {
  table: string
  issue: string
  severity: 'critical' | 'high' | 'medium'
  details: string
  leaked_fields?: string[]
  sample_data?: any
  ai_analysis?: {
    risk_assessment: string
    sensitive_data_found: string[]
    recommendations: string[]
    auto_fix_sql?: string
  }
}

export interface ScanResult {
  success: boolean
  vulnerabilities: Vulnerability[]
  summary: {
    total_tables: number
    vulnerable_tables: number
    secure_tables: number
  }
  error?: string
}

/**
 * AI-powered vulnerability analysis using Claude
 */
async function analyzeWithAI(
  anthropic: Anthropic | null,
  tableName: string,
  fields: string[],
  sampleData: any,
  rlsEnabled: boolean
): Promise<Vulnerability['ai_analysis']> {
  if (!anthropic) return undefined

  try {
    console.log(`🤖 [AI] Analyzing ${tableName} with Claude...`)

    const vulnerabilityContext = rlsEnabled
      ? "RLS is ENABLED but the policy is too permissive (allows public access)."
      : "RLS is DISABLED completely."

    const prompt = `You are a database security expert analyzing a vulnerability in a Supabase database.

TABLE: ${tableName}
EXPOSED FIELDS: ${fields.join(', ')}
SAMPLE DATA: ${JSON.stringify(sampleData, null, 2)}
RLS STATUS: ${vulnerabilityContext}

This table is PUBLICLY ACCESSIBLE without authentication.

Analyze this vulnerability and provide:

1. **Risk Assessment**: A concise explanation of the security impact (2-3 sentences)
2. **Sensitive Data Found**: List any sensitive data types you detect (PII, credentials, financial data, etc.)
3. **Recommendations**: 3-5 specific, actionable steps to fix this vulnerability.
   ${rlsEnabled ? "IMPORTANT: RLS is already enabled. Focus recommendations on fixing the specific policy (e.g. remove 'true' condition), not enabling RLS." : "IMPORTANT: Recommend enabling RLS first."}
4. **Auto-Fix SQL**: A complete SQL script to fix the vulnerability.

Format your response as JSON:
{
  "risk_assessment": "...",
  "sensitive_data_found": ["type1", "type2"],
  "recommendations": ["step1", "step2", "step3"],
  "auto_fix_sql": "-- SQL commands here"
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })

    const content = message.content[0]
    if (content.type === 'text') {
      // Extract JSON from the response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0])
        console.log(`✅ [AI] Analysis complete for ${tableName}`)
        return analysis
      }
    }
  } catch (error) {
    console.error(`❌ [AI] Failed to analyze ${tableName}:`, error)
  }

  return undefined
}

/**
 * Core scanning function
 * Tests database for RLS vulnerabilities
 * 
 * NO SETUP REQUIRED! Works with ANY Supabase project via OAuth.
 * Uses Management API to query database schema.
 * 
 * @param projectUrl - Supabase project URL (e.g., https://xxxxx.supabase.co)
 * @param projectRef - Project reference ID
 * @param serviceKey - Service role key (bypasses RLS)
 * @param anonKey - Anonymous key (respects RLS)
 * @param accessToken - OAuth access token for Management API
 * @param options - Optional configuration
 */
export async function scanProject(
  projectUrl: string,
  projectRef: string,
  serviceKey: string,
  anonKey: string,
  accessToken: string,
  options: {
    maxTables?: number
    enableAI?: boolean
  } = {}
): Promise<ScanResult> {
  const { maxTables = 10, enableAI = true } = options

  try {
    // Create two clients: one with service_role (bypasses RLS), one with anon (respects RLS)
    const adminClient = createClient(projectUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const anonClient = createClient(projectUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Initialize Claude AI (optional)
    let anthropic: Anthropic | null = null
    if (enableAI && process.env.ANTHROPIC_API_KEY) {
      anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      console.log('🤖 [AI] Claude AI enabled for intelligent analysis')
    } else if (enableAI) {
      console.log('⚠️  [AI] No Anthropic API key found - using basic analysis')
    }

    console.log('🔍 [SCAN] Starting security scan...')
    console.log('✅ NO SETUP REQUIRED - Works with any Supabase project!')

    // Step 1: Get all tables using Management API
    // Uses the official Management API endpoint: POST /v1/projects/{ref}/database/query
    let tableNames: string[] = []
    const tableRlsStatus = new Map<string, boolean>()

    try {
      console.log('🔍 [SCAN] Querying database schema via Management API...')

      // Query information_schema.tables using Management API
      // Join with pg_class to check if RLS is enabled (relrowsecurity)
      const result = await executeQuery(
        accessToken,
        projectRef,
        `SELECT 
           t.tablename as table_name,
           c.relrowsecurity as rls_enabled
         FROM pg_catalog.pg_tables t
         JOIN pg_catalog.pg_class c ON c.relname = t.tablename
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
         WHERE t.schemaname = 'public' 
         ORDER BY t.tablename;`
      )

      if (!result || result.length === 0) {
        return {
          success: true, // Not an error - just no tables
          vulnerabilities: [],
          summary: {
            total_tables: 0,
            vulnerable_tables: 0,
            secure_tables: 0,
          },
        }
      }

      // Store table names and their RLS status
      result.forEach((row: any) => {
        tableNames.push(row.table_name)
        tableRlsStatus.set(row.table_name, row.rls_enabled)
      })

      console.log(`✅ Found ${tableNames.length} tables in database:`, tableNames)

    } catch (error) {
      console.error('Failed to fetch tables:', error)
      return {
        success: false,
        vulnerabilities: [],
        summary: {
          total_tables: 0,
          vulnerable_tables: 0,
          secure_tables: 0,
        },
        error: error instanceof Error ? error.message : 'Failed to query database schema via Management API',
      }
    }

    // Step 2: Test each table for vulnerabilities
    const vulnerabilities: Vulnerability[] = []
    let scannedCount = 0

    // Parallel execution configuration
    const CONCURRENCY_LIMIT = 5

    // Helper function to scan a single table
    const scanTable = async (tableName: string) => {
      console.log(`🔍 Testing: ${tableName}`)

      try {
        // TEST: Can anonymous user read any data?
        const { data: anonData, error: anonError } = await anonClient
          .from(tableName)
          .select('*')
          .limit(1)

        console.log(`🔍 [SCAN] Querying ${tableName} (anon):`, { dataLength: anonData?.length, error: anonError })

        if (!anonError && anonData && anonData.length > 0) {
          // Get column names
          const fields = Object.keys(anonData[0])
          const rlsEnabled = tableRlsStatus.get(tableName) || false

          // Perform AI analysis if available
          const aiAnalysis = await analyzeWithAI(anthropic, tableName, fields, anonData[0], rlsEnabled)

          vulnerabilities.push({
            table: tableName,
            issue: rlsEnabled
              ? 'RLS is enabled but policy is too permissive (public access)'
              : 'Anonymous users can read data from this table',
            severity: 'critical',
            details: rlsEnabled
              ? `Table "${tableName}" has RLS enabled, but a policy is allowing broad public access. ${fields.length} fields are exposed.`
              : `Table "${tableName}" is publicly accessible without authentication. ${fields.length} fields are exposed.`,
            leaked_fields: fields,
            sample_data: anonData[0],
            ai_analysis: aiAnalysis,
          })

          console.log(`⚠️  CRITICAL: ${tableName} is publicly readable!`)
        } else {
          console.log(`✅ ${tableName} is protected`)
        }
      } catch (error) {
        console.log(`✅ ${tableName} blocked (as expected)`, error)
      }
    }

    // Process tables in chunks to avoid overwhelming resources
    const tablesToScan = tableNames.slice(0, maxTables)
    scannedCount = tablesToScan.length

    for (let i = 0; i < tablesToScan.length; i += CONCURRENCY_LIMIT) {
      const chunk = tablesToScan.slice(i, i + CONCURRENCY_LIMIT)
      await Promise.all(chunk.map(tableName => scanTable(tableName)))
    }

    console.log(`✅ Scan complete. Found ${vulnerabilities.length} vulnerabilities in ${scannedCount} tables`)

    return {
      success: true,
      vulnerabilities,
      summary: {
        total_tables: scannedCount,
        vulnerable_tables: vulnerabilities.length,
        secure_tables: scannedCount - vulnerabilities.length,
      },
    }

  } catch (error) {
    console.error('❌ Scan error:', error)
    return {
      success: false,
      vulnerabilities: [],
      summary: {
        total_tables: 0,
        vulnerable_tables: 0,
        secure_tables: 0,
      },
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

