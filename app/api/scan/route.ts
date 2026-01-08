import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

interface Vulnerability {
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

export async function POST(req: Request) {
  try {
    const { url, serviceKey, anonKey } = await req.json()

    if (!url || !serviceKey || !anonKey) {
      return NextResponse.json(
        { error: 'URL, service role key, and anon key are required' },
        { status: 400 }
      )
    }

    // Two clients: one with service_role (bypasses RLS), one with anon (respects RLS)
    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const anonClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Initialize Claude AI (optional - falls back to basic analysis if no key)
    let anthropic: Anthropic | null = null
    if (process.env.ANTHROPIC_API_KEY) {
      anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      console.log('🤖 [AI] Claude AI enabled for intelligent analysis')
    } else {
      console.log('⚠️  [AI] No Anthropic API key found - using basic analysis')
    }

    console.log('🔍 [SCAN] Starting security scan...')

    // Helper function: AI-powered vulnerability analysis
    async function analyzeWithAI(
      tableName: string, 
      fields: string[], 
      sampleData: any
    ): Promise<Vulnerability['ai_analysis']> {
      if (!anthropic) return undefined

      try {
        console.log(`🤖 [AI] Analyzing ${tableName} with Claude...`)
        
        const prompt = `You are a database security expert analyzing a vulnerability in a Supabase database.

TABLE: ${tableName}
EXPOSED FIELDS: ${fields.join(', ')}
SAMPLE DATA: ${JSON.stringify(sampleData, null, 2)}

This table is PUBLICLY ACCESSIBLE without authentication (RLS is disabled or misconfigured).

Analyze this vulnerability and provide:

1. **Risk Assessment**: A concise explanation of the security impact (2-3 sentences)
2. **Sensitive Data Found**: List any sensitive data types you detect (PII, credentials, financial data, etc.)
3. **Recommendations**: 3-5 specific, actionable steps to fix this vulnerability
4. **Auto-Fix SQL**: A complete SQL script to enable RLS and create appropriate policies

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

    // Step 1: Get all tables using RPC function
    // Note: You need to create this function in Supabase SQL Editor first (see README)
    const { data: tables, error: tablesError } = await adminClient
      .rpc('get_public_tables')

    if (tablesError) {
      console.error('Failed to fetch tables:', tablesError)
      return NextResponse.json(
        { 
          error: 'Could not fetch tables. Make sure you created the get_public_tables() function in Supabase.',
          details: tablesError.message 
        },
        { status: 500 }
      )
    }

    if (!tables || tables.length === 0) {
      return NextResponse.json(
        { error: 'No tables found in your database.' },
        { status: 404 }
      )
    }

    console.log(`✅ Found ${tables.length} tables`)

    // Step 2: Test each table for vulnerabilities
    const vulnerabilities: Vulnerability[] = []
    let scannedCount = 0

    for (const tableRow of tables) {
      // Handle both object {table_name: "..."} and string responses
      const tableName = typeof tableRow === 'string' ? tableRow : tableRow.table_name

      // Skip system tables
      if (tableName.startsWith('_') || tableName.startsWith('pg_')) {
        continue
      }

      console.log(`🔍 Testing: ${tableName}`)
      scannedCount++

      // TEST 1: Can anonymous user read any data?
      try {
        const { data: anonData, error: anonError } = await anonClient
          .from(tableName)
          .select('*')
          .limit(1)

        if (!anonError && anonData && anonData.length > 0) {
          // Get column names
          const fields = Object.keys(anonData[0])
          
          // Perform AI analysis if available
          const aiAnalysis = await analyzeWithAI(tableName, fields, anonData[0])
          
          vulnerabilities.push({
            table: tableName,
            issue: 'Anonymous users can read data from this table',
            severity: 'critical',
            details: `Table "${tableName}" is publicly accessible without authentication. ${fields.length} fields are exposed.`,
            leaked_fields: fields,
            sample_data: anonData[0],
            ai_analysis: aiAnalysis,
          })

          console.log(`⚠️  CRITICAL: ${tableName} is publicly readable!`)
        } else {
          console.log(`✅ ${tableName} is protected`)
        }
      } catch (error) {
        console.log(`✅ ${tableName} blocked (as expected)`)
      }

      // Limit scan to first 10 tables for demo
      if (scannedCount >= 10) break
    }

    console.log(`✅ Scan complete. Found ${vulnerabilities.length} vulnerabilities in ${scannedCount} tables`)

    return NextResponse.json({
      success: true,
      vulnerabilities,
      summary: {
        total_tables: scannedCount,
        vulnerable_tables: vulnerabilities.length,
        secure_tables: scannedCount - vulnerabilities.length,
      },
    })

  } catch (error) {
    console.error('❌ Scan error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

export const maxDuration = 60 // Allow up to 60 seconds for scan