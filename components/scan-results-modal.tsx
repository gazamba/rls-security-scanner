'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'

interface Vulnerability {
  table: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  issue: string
  description: string
  recommendation: string
  ai_analysis?: string
}

interface ScanResult {
  id: string
  scan_date: string
  vulnerabilities_found: number
  summary: {
    total_tables: number
    vulnerable_tables: number
    secure_tables: number
  }
  vulnerabilities?: Vulnerability[] | null
  ai_insights?: string
  details?: {
    vulnerabilities?: any[]
  }
}

interface ScanResultsModalProps {
  isOpen: boolean
  onClose: () => void
  scanResult: ScanResult | null
  projectName: string
}

export function ScanResultsModal({ isOpen, onClose, scanResult, projectName }: ScanResultsModalProps) {
  if (!scanResult) return null

  // Debug logging
  console.log('📊 Scan Result Data:', {
    vulnerabilities_found: scanResult.vulnerabilities_found,
    has_vulnerabilities: !!scanResult.vulnerabilities,
    vulnerabilities_length: scanResult.vulnerabilities?.length,
    has_details: !!scanResult.details,
    details_vulnerabilities_length: scanResult.details?.vulnerabilities?.length,
    raw_vulnerabilities: scanResult.vulnerabilities,
    raw_details: scanResult.details,
  })

  // Get vulnerabilities from either the direct field or details.vulnerabilities (fallback)
  const vulnerabilities = scanResult.vulnerabilities || scanResult.details?.vulnerabilities || []
  
  // Format vulnerabilities to ensure consistent structure
  const formattedVulnerabilities = vulnerabilities.map((vuln: any) => {
    // Handle ai_analysis which might be an object or a string
    let aiAnalysisText: string | undefined = undefined
    if (vuln.ai_analysis) {
      if (typeof vuln.ai_analysis === 'string') {
        aiAnalysisText = vuln.ai_analysis
      } else if (typeof vuln.ai_analysis === 'object') {
        // Extract text from the object
        const parts = []
        if (vuln.ai_analysis.risk_assessment) parts.push(`Risk: ${vuln.ai_analysis.risk_assessment}`)
        if (vuln.ai_analysis.sensitive_data_found?.length) {
          parts.push(`Sensitive Data: ${vuln.ai_analysis.sensitive_data_found.join(', ')}`)
        }
        if (vuln.ai_analysis.recommendations?.length) {
          parts.push(`Recommendations:\n${vuln.ai_analysis.recommendations.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')}`)
        }
        aiAnalysisText = parts.length > 0 ? parts.join('\n\n') : undefined
      }
    }
    
    return {
      table: vuln.table || vuln.table_name || 'Unknown',
      severity: (vuln.severity?.toLowerCase() || 'medium') as 'critical' | 'high' | 'medium' | 'low',
      issue: vuln.issue || 'Security issue detected',
      description: vuln.description || vuln.details || 'No description available',
      recommendation: vuln.recommendation || 'Enable RLS and create appropriate policies',
      ai_analysis: aiAnalysisText,
    }
  })
  
  console.log('✅ Formatted Vulnerabilities:', formattedVulnerabilities)

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-600'
      case 'high':
        return 'bg-orange-600'
      case 'medium':
        return 'bg-yellow-600'
      case 'low':
        return 'bg-blue-600'
      default:
        return 'bg-gray-600'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '🔴'
      case 'high':
        return '🟠'
      case 'medium':
        return '🟡'
      case 'low':
        return '🔵'
      default:
        return '⚪'
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-700">
          <DialogTitle className="text-2xl">Scan Results: {projectName}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Scanned on {new Date(scanResult.scan_date).toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-slate-300">{scanResult.summary.total_tables}</div>
              <div className="text-sm text-slate-500">Total Tables</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-red-500">{scanResult.vulnerabilities_found}</div>
              <div className="text-sm text-slate-500">Vulnerabilities</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-500">{scanResult.summary.secure_tables}</div>
              <div className="text-sm text-slate-500">Secure Tables</div>
            </div>
          </div>

          <Separator className="bg-slate-700" />

          {/* AI Insights */}
          {scanResult.ai_insights && (
            <>
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  🤖 AI Security Insights
                </h3>
                <Alert className="border-blue-900 bg-blue-950/50">
                  <AlertDescription className="text-blue-100 whitespace-pre-wrap">
                    {scanResult.ai_insights}
                  </AlertDescription>
                </Alert>
              </div>
              <Separator className="bg-slate-700" />
            </>
          )}

          {/* Vulnerabilities */}
          {scanResult.vulnerabilities_found > 0 ? (
            <div>
              <h3 className="text-lg font-semibold mb-4">
                ⚠️ Security Issues Found ({scanResult.vulnerabilities_found})
              </h3>
              <div className="space-y-4">
                {formattedVulnerabilities.map((vuln, index) => (
                  <div
                    key={index}
                    className="bg-slate-800/80 border border-slate-700 rounded-lg p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xl">{getSeverityIcon(vuln.severity)}</span>
                          <h4 className="text-lg font-semibold text-white">{vuln.table}</h4>
                          <Badge className={`${getSeverityColor(vuln.severity)} text-white border-0`}>
                            {vuln.severity.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-red-300 font-medium mb-3">{vuln.issue}</p>
                        <p className="text-slate-300 mb-3">{vuln.description}</p>
                      </div>
                    </div>

                    <Separator className="bg-slate-700" />

                    <div>
                      <h5 className="text-sm font-semibold text-blue-400 mb-2">💡 Recommendation:</h5>
                      <p className="text-slate-300 text-sm">{vuln.recommendation}</p>
                    </div>

                    {vuln.ai_analysis && (
                      <>
                        <Separator className="bg-slate-700" />
                        <div>
                          <h5 className="text-sm font-semibold text-purple-400 mb-2">🤖 AI Analysis:</h5>
                          <p className="text-slate-300 text-sm whitespace-pre-wrap">{vuln.ai_analysis}</p>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Alert className="border-green-900 bg-green-950/50">
              <AlertDescription className="text-green-100">
                ✅ No vulnerabilities found! All tables have proper RLS policies configured.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

