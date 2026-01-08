'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface IntegrationCardProps {
  isConnected: boolean
  onConnect: () => void
  onDisconnect: () => void
  onAddProjects?: () => void
  projectCount?: number
}

export function IntegrationCard({ 
  isConnected, 
  onConnect, 
  onDisconnect,
  onAddProjects,
  projectCount = 0 
}: IntegrationCardProps) {
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)

  const handleDisconnectClick = () => {
    setShowDisconnectDialog(true)
  }

  const handleConfirmDisconnect = () => {
    setShowDisconnectDialog(false)
    onDisconnect()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-4xl">🔷</div>
              <div>
                <CardTitle>Supabase</CardTitle>
                <CardDescription>
                  {isConnected 
                    ? `${projectCount} project${projectCount !== 1 ? 's' : ''} connected` 
                    : 'Connect your Supabase account to start scanning'}
                </CardDescription>
              </div>
            </div>
            {isConnected && (
              <Badge variant="default" className="bg-green-600">
                Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <div className="flex gap-2">
              {onAddProjects && (
                <Button variant="default" size="sm" onClick={onAddProjects}>
                  Add Projects
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={handleDisconnectClick}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button onClick={onConnect} className="w-full">
              Connect Supabase
            </Button>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Supabase?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              This will remove all your connected projects and scan history. 
              You can reconnect anytime, but you'll need to scan your projects again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white hover:bg-slate-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDisconnect}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

