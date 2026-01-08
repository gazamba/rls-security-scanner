'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

interface AvailableProject {
  id: string
  ref: string
  name: string
  organization_id: string
  region: string
}

interface ProjectSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onProjectsSelected: (projectRefs: string[]) => Promise<void>
}

export function ProjectSelectionModal({ isOpen, onClose, onProjectsSelected }: ProjectSelectionModalProps) {
  const [availableProjects, setAvailableProjects] = useState<AvailableProject[]>([])
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetchAvailableProjects()
    }
  }, [isOpen])

  const fetchAvailableProjects = async () => {
    setLoading(true)
    setError(null)
    try {
      // Get user from client-side auth
      const { supabase } = await import('@/lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setError('Not authenticated')
        setLoading(false)
        return
      }
      
      const response = await fetch(`/api/integrations/supabase/available-projects?user_id=${user.id}`)
      const data = await response.json()
      
      if (data.success) {
        setAvailableProjects(data.projects)
      } else {
        setError(data.error || 'Failed to fetch projects')
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
      setError('Failed to fetch projects')
    } finally {
      setLoading(false)
    }
  }

  const toggleProject = (projectRef: string) => {
    const newSelected = new Set(selectedProjects)
    if (newSelected.has(projectRef)) {
      newSelected.delete(projectRef)
    } else {
      newSelected.add(projectRef)
    }
    setSelectedProjects(newSelected)
  }

  const toggleAll = () => {
    if (selectedProjects.size === availableProjects.length) {
      setSelectedProjects(new Set())
    } else {
      setSelectedProjects(new Set(availableProjects.map(p => p.ref)))
    }
  }

  const handleSave = async () => {
    if (selectedProjects.size === 0) {
      setError('Please select at least one project')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onProjectsSelected(Array.from(selectedProjects))
      onClose()
    } catch (err) {
      console.error('Failed to save projects:', err)
      setError('Failed to save selected projects')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-700">
          <DialogTitle className="text-xl">Select Projects to Scan</DialogTitle>
          <DialogDescription className="text-slate-400">
            Choose which Supabase projects you want to analyze for security vulnerabilities
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32 bg-slate-700" />
                <Skeleton className="h-8 w-24 bg-slate-700" />
              </div>
              <Separator className="bg-slate-700" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-5 w-48 bg-slate-700" />
                  <Skeleton className="h-4 w-64 bg-slate-700" />
                </div>
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive" className="border-red-900 bg-red-950/50">
              <AlertDescription className="text-red-300">
                {error}
              </AlertDescription>
              <Button 
                onClick={fetchAvailableProjects} 
                variant="outline" 
                size="sm" 
                className="mt-3 border-red-800 text-red-300 hover:bg-red-950"
              >
                Try Again
              </Button>
            </Alert>
          ) : availableProjects.length === 0 ? (
            <Alert className="border-slate-700 bg-slate-800">
              <AlertDescription className="text-slate-400">
                No projects found in your Supabase account
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-slate-400 font-medium">
                  {selectedProjects.size} of {availableProjects.length} selected
                </p>
                <Button 
                  onClick={toggleAll} 
                  variant="outline" 
                  size="sm"
                  className="border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  {selectedProjects.size === availableProjects.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              <Separator className="bg-slate-700" />

              <div className="space-y-2">
                {availableProjects.map((project) => (
                  <div
                    key={project.ref}
                    onClick={() => toggleProject(project.ref)}
                    className={`
                      p-4 rounded-lg border cursor-pointer transition-all duration-200
                      ${selectedProjects.has(project.ref)
                        ? 'border-blue-500 bg-blue-500/20 shadow-lg shadow-blue-500/20'
                        : 'border-slate-700 hover:border-slate-600 bg-slate-800/80 hover:bg-slate-800'
                      }
                    `}
                  >
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={selectedProjects.has(project.ref)}
                        onCheckedChange={() => toggleProject(project.ref)}
                        className="border-slate-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                      />
                      <div className="flex-1">
                        <h4 className="font-semibold text-white">{project.name}</h4>
                        <p className="text-sm text-slate-400 mt-1">
                          {project.ref} • {project.region}
                        </p>
                      </div>
                      {selectedProjects.has(project.ref) && (
                        <Badge variant="default" className="bg-blue-600">
                          ✓
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter className="px-6 pb-6 pt-4 border-t border-slate-700 bg-slate-900">
          <Button 
            onClick={onClose} 
            variant="outline" 
            disabled={saving}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving || selectedProjects.size === 0 || loading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? 'Saving...' : `Add ${selectedProjects.size} Project${selectedProjects.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

