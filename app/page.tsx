'use client'

import { Suspense, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRouter, useSearchParams } from 'next/navigation'
import SignIn from '@/components/sign-in'
import { IntegrationCard } from '@/components/integration-card'
import { ProjectCard } from '@/components/project-card'
import { ProjectSelectionModal } from '@/components/project-selection-modal'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

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
    vulnerabilities: Array<{
      table: string
      severity: 'critical' | 'high' | 'medium' | 'low'
      issue: string
      description: string
      recommendation: string
      ai_analysis?: string
    }>
    ai_insights?: string
  } | null
}

function HomeContent() {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showProjectSelectionModal, setShowProjectSelectionModal] = useState(false)

  // Check for OAuth callback success
  useEffect(() => {
    if (searchParams.get('connected') === 'true') {
      toast.success('Connected to Supabase!', {
        description: 'Select which projects you want to scan'
      })

      // Show project selection modal
      setShowProjectSelectionModal(true)

      // Clean up URL
      router.replace('/')
    }

    if (searchParams.get('error')) {
      const error = searchParams.get('error')
      const message = searchParams.get('message')
      toast.error('Connection failed', {
        description: message || error || 'Unknown error occurred'
      })
      router.replace('/')
    }
  }, [searchParams, router])

  // Fetch projects on mount and set up polling for scan updates
  useEffect(() => {
    if (!user) return

    const fetchProjects = async () => {
      try {
        const response = await fetch(`/api/integrations/supabase/projects?user_id=${user.id}`)
        const data = await response.json()

        if (data.success) {
          setProjects(data.projects)
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error)
      } finally {
        setLoadingProjects(false)
      }
    }

    fetchProjects()

    // Poll for updates every 5 seconds if any project is scanning
    const interval = setInterval(() => {
      if (projects.some(p => p.scan_status === 'scanning')) {
        fetchProjects()
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [user, projects.some(p => p.scan_status === 'scanning')])

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-slate-300">Loading...</p>
        </div>
      </div>
    )
  }

  // Show sign-in page if not authenticated
  if (!user) {
    return <SignIn />
  }

  const isConnected = projects.length > 0

  const handleConnect = () => {
    // Check if user is authenticated
    if (!user) {
      toast.error('Please sign in first', {
        description: 'You need to be signed in before connecting Supabase'
      })
      return
    }
    // Pass user_id as query parameter
    window.location.href = `/api/auth/supabase/authorize?user_id=${user.id}`
  }

  const handleProjectsSelected = async (projectRefs: string[]) => {
    if (!user) return

    try {
      const response = await fetch('/api/integrations/supabase/save-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_refs: projectRefs,
          user_id: user.id,
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success(data.message || 'Projects added successfully', {
          description: 'Click "Start Scan" on any project to analyze it for vulnerabilities'
        })

        // Refresh projects list
        const refreshResponse = await fetch(`/api/integrations/supabase/projects?user_id=${user.id}`)
        const refreshData = await refreshResponse.json()
        if (refreshData.success) {
          setProjects(refreshData.projects)
        }
      } else {
        toast.error('Failed to add projects', {
          description: data.error
        })
      }
    } catch (error) {
      console.error('Failed to save projects:', error)
      toast.error('Failed to save projects')
      throw error
    }
  }

  const handleDisconnect = async () => {
    if (!user) return

    try {
      const response = await fetch('/api/auth/supabase/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })

      if (response.ok) {
        toast.success('Disconnected from Supabase', {
          description: 'All projects and scan data have been removed'
        })
        setProjects([])
      } else {
        toast.error('Failed to disconnect')
      }
    } catch (error) {
      console.error('Failed to disconnect:', error)
      toast.error('Failed to disconnect')
    }
  }

  const handleRefreshProjects = async () => {
    if (!user) return

    setRefreshing(true)
    try {
      const response = await fetch(`/api/integrations/supabase/projects?user_id=${user.id}`)
      const data = await response.json()

      if (data.success) {
        setProjects(data.projects)
        toast.success('Projects refreshed')
      } else {
        toast.error('Failed to refresh projects')
      }
    } catch (error) {
      console.error('Failed to refresh projects:', error)
      toast.error('Failed to refresh projects')
    } finally {
      setRefreshing(false)
    }
  }

  const handleScanProject = async (projectId: string) => {
    if (!user) return

    try {
      // Optimistically update UI
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, scan_status: 'scanning' as const } : p
      ))

      const response = await fetch('/api/integrations/supabase/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, user_id: user.id }),
      })

      const data = await response.json()

      if (data.success) {
        console.log('🔍 Scan Response Data:', data)
        console.log('🔍 Vulnerabilities Found:', data.scan_result?.vulnerabilities_found)
        toast.success('Scan completed', {
          description: `Found ${data.scan_result.vulnerabilities_found} vulnerabilities`
        })

        // Refresh projects to get updated scan results
        const refreshResponse = await fetch(`/api/integrations/supabase/projects?user_id=${user.id}`)
        const refreshData = await refreshResponse.json()
        if (refreshData.success) {
          setProjects(refreshData.projects)
        }
      } else {
        toast.error('Scan failed', {
          description: data.error
        })
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, scan_status: 'error' as const, scan_error: data.error } : p
        ))
      }
    } catch (error) {
      console.error('Scan failed:', error)
      toast.error('Scan failed')
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, scan_status: 'error' as const } : p
      ))
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* User Info Header */}
        <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            {user.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt="Profile"
                className="w-10 h-10 rounded-full border-2 border-slate-600"
              />
            )}
            <div>
              <p className="text-sm text-slate-400">Signed in as</p>
              <p className="font-semibold">{user.email || user.user_metadata?.full_name}</p>
            </div>
          </div>
          <Button
            onClick={() => signOut()}
            variant="outline"
            size="sm"
          >
            Sign Out
          </Button>
        </div>

        {/* Header */}
        <div className="text-center mb-12">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-5xl font-bold mb-4">RLS Security Scanner</h1>
          <p className="text-xl text-slate-300">
            Find data leaks in your Supabase Row Level Security policies
          </p>
        </div>

        {/* Integrations Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Integrations</h2>
          <IntegrationCard
            isConnected={isConnected}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onAddProjects={() => setShowProjectSelectionModal(true)}
            projectCount={projects.length}
          />
        </section>

        {/* Projects Section */}
        {isConnected && (
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Your Projects</h2>
              <Button
                onClick={handleRefreshProjects}
                disabled={refreshing}
                variant="outline"
                size="sm"
              >
                {refreshing ? 'Refreshing...' : 'Refresh Projects'}
              </Button>
            </div>

            {loadingProjects ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                <p className="text-slate-300">Loading projects...</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-slate-400">No projects found</p>
                <Button
                  onClick={handleRefreshProjects}
                  variant="outline"
                  size="sm"
                  className="mt-4"
                >
                  Refresh Projects
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onScan={handleScanProject}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Empty State - Now handled by IntegrationCard */}
      </div>

      {/* Project Selection Modal */}
      <ProjectSelectionModal
        isOpen={showProjectSelectionModal}
        onClose={() => setShowProjectSelectionModal(false)}
        onProjectsSelected={handleProjectsSelected}
      />
    </main>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-slate-300">Loading...</p>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}
