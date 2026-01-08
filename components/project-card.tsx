'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScanResultsModal } from '@/components/scan-results-modal'

interface Project {
  id: string
  project_ref: string
  project_name: string
  region: string
  scan_status: 'pending' | 'scanning' | 'completed' | 'error'
  scan_error?: string | null
  last_scanned_at?: string | null
  latest_scan?: {
    id: string
    scan_date: string
    vulnerabilities_found: number
    summary: {
      total_tables: number
      vulnerable_tables: number
      secure_tables: number
    }
  } | null
}

interface ProjectCardProps {
  project: Project
  onScan: (projectId: string) => Promise<void>
}

export function ProjectCard({ project, onScan }: ProjectCardProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const handleScan = async () => {
    setIsScanning(true)
    try {
      await onScan(project.id)
    } finally {
      setIsScanning(false)
    }
  }

  const getStatusBadge = () => {
    switch (project.scan_status) {
      case 'pending':
        return <Badge variant="secondary">Not Scanned</Badge>
      case 'scanning':
        return <Badge variant="default" className="bg-blue-600">Scanning...</Badge>
      case 'completed':
        return <Badge variant="default" className="bg-green-600">Completed</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      default:
        return null
    }
  }

  const getSeverityColor = (count: number) => {
    if (count === 0) return 'text-green-500'
    if (count < 3) return 'text-yellow-500'
    return 'text-red-500'
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{project.project_name}</CardTitle>
            <CardDescription className="text-xs mt-1">
              {project.project_ref} • {project.region}
            </CardDescription>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent>
        {project.latest_scan && project.scan_status === 'completed' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-slate-300">
                  {project.latest_scan.summary.total_tables}
                </div>
                <div className="text-xs text-slate-500">Tables</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${getSeverityColor(project.latest_scan.vulnerabilities_found)}`}>
                  {project.latest_scan.vulnerabilities_found}
                </div>
                <div className="text-xs text-slate-500">Issues</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-500">
                  {project.latest_scan.summary.secure_tables}
                </div>
                <div className="text-xs text-slate-500">Secure</div>
              </div>
            </div>
            <Separator className="bg-slate-700" />
            {project.last_scanned_at && (
              <p className="text-xs text-slate-500 text-center">
                Last scanned: {new Date(project.last_scanned_at).toLocaleDateString()} at {new Date(project.last_scanned_at).toLocaleTimeString()}
              </p>
            )}

            {project.latest_scan && (
              <Button
                onClick={() => setShowResults(true)}
                variant="outline"
                size="sm"
                className="w-full mt-3"
              >
                View Detailed Report
              </Button>
            )}
          </div>
        ) : project.scan_status === 'error' ? (
          <Alert variant="destructive" className="border-red-900 bg-red-950/50">
            <AlertDescription className="text-red-300 text-sm">
              {project.scan_error || 'Scan failed'}
            </AlertDescription>
          </Alert>
        ) : project.scan_status === 'scanning' || isScanning ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <p className="text-sm text-slate-400">Scanning in progress...</p>
            </div>
            <Separator className="bg-slate-700" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full bg-slate-700" />
              <Skeleton className="h-4 w-3/4 bg-slate-700 mx-auto" />
            </div>
          </div>
        ) : (
          <Alert className="border-slate-700 bg-slate-800/50">
            <AlertDescription className="text-slate-400 text-sm text-center">
              No scan results yet - Click "Start Scan" to analyze this project
            </AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleScan}
          disabled={isScanning || project.scan_status === 'scanning'}
          className="w-full mt-4"
          variant={project.scan_status === 'completed' ? 'outline' : 'default'}
        >
          {isScanning || project.scan_status === 'scanning'
            ? 'Scanning...'
            : project.scan_status === 'completed'
              ? 'Re-scan'
              : 'Start Scan'}
        </Button>
      </CardContent>

      <ScanResultsModal
        isOpen={showResults}
        onClose={() => setShowResults(false)}
        scanResult={project.latest_scan || null}
        projectName={project.project_name}
      />
    </Card>
  )
}

