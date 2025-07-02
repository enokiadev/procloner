import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import Header from './components/Header'
import URLInput from './components/URLInput'
import CloningProgress from './components/CloningProgress'
import ResultsPanel from './components/ResultsPanel'
import ActivityLog from './components/ActivityLog'
import GoogleLogin from './components/GoogleLogin'
import AdminDashboard from './components/AdminDashboard'
import { useWebSocket } from './hooks/useWebSocket'
import { CloningSession, LogEntry } from './types'
import { getWebSocketUrl, logConfig } from './config'
import { logger, websocket, session, api } from './utils/logger'
import { AuthProvider, useAuth } from './contexts/AuthContext'

function AppContent() {
  const [currentSession, setCurrentSession] = useState<CloningSession | null>(null)
  const [isCloning, setIsCloning] = useState(false)
  const [activityLog, setActivityLog] = useState<LogEntry[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('connecting')
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false)
  const [recoverableSession, setRecoverableSession] = useState<any>(null)
  const logIdCounter = useRef(0)

  // Log configuration on startup
  useEffect(() => {
    logConfig()
  }, [])

  // WebSocket connection for real-time updates
  const { sendMessage, isConnected } = useWebSocket(getWebSocketUrl(), {
    onOpen: () => {
      websocket.connected(getWebSocketUrl())
      setConnectionStatus('connected')
      // Try to recover session if we have one stored
      const storedSessionId = localStorage.getItem('procloner_session_id')
      if (storedSessionId && !currentSession) {
        logger.info('Attempting session recovery', { sessionId: storedSessionId })
        sendMessage({
          type: 'recover_session',
          sessionId: storedSessionId!
        })
      }
    },
    onClose: () => {
      websocket.disconnected()
      setConnectionStatus('disconnected')
    },
    onError: () => {
      websocket.reconnecting()
      setConnectionStatus('reconnecting')
    },
    onMessage: (message) => {
      websocket.messageReceived(message.type, message.sessionId)
      logger.debug('Processing WebSocket message', {
        currentSessionId: currentSession?.id,
        messageSessionId: message.sessionId,
        messageType: message.type
      })

      // Handle connection status messages
      if (message.type === 'connection_status') {
        setConnectionStatus(message.status as any)
        return
      }

      // Handle session recovery responses
      if (message.type === 'session_not_found') {
        logger.info('Session not found, clearing stored session', { sessionId: message.sessionId })
        localStorage.removeItem('procloner_session_id')
        setCurrentSession(null)
        setIsCloning(false)
        return
      }

      // Handle session recovery available
      if (message.type === 'session_recovery_available') {
        logger.info('Session recovery available', {
          sessionId: message.sessionId,
          progress: message.progress,
          url: message.url
        })
        setRecoverableSession(message)
        setShowRecoveryDialog(true)
        return
      }

      // Handle session resumed
      if (message.type === 'session_resumed') {
        session.recovered(message.sessionId || '')
        setIsCloning(true)
        setShowRecoveryDialog(false)
        setRecoverableSession(null)
        return
      }

      // Handle session resume failed
      if (message.type === 'session_resume_failed') {
        logger.warn('Session resume failed', {
          sessionId: message.sessionId,
          reason: message.message
        })
        setShowRecoveryDialog(false)
        setRecoverableSession(null)
        return
      }

      // Handle messages even if session is not set yet (for initial status updates)
      if (message.sessionId && (message.sessionId === currentSession?.id || !currentSession)) {
        logger.debug('Processing status message')

        // If we don't have a session yet but receive a message, try to match it
        if (!currentSession && message.sessionId) {
          logger.debug('Creating session from WebSocket message', { sessionId: message.sessionId })
          // Store the session ID for recovery
          localStorage.setItem('procloner_session_id', message.sessionId)
        }

        // Update session state
        setCurrentSession(prev => {
          // If we have a session and IDs match, update it
          if (prev && message.sessionId === prev.id) {
            return {
              ...prev,
              status: message.status || prev.status,
              progress: typeof message.progress === 'number' ? message.progress : prev.progress,
              assets: typeof message.totalAssets === 'number' ? message.totalAssets : prev.assets,
              error: message.error || prev.error
            }
          }
          // If we don't have a session but have a sessionId, create a minimal session
          else if (!prev && message.sessionId) {
            return {
              id: message.sessionId,
              url: '', // Will be updated when we get the actual session
              status: message.status || 'starting',
              progress: typeof message.progress === 'number' ? message.progress : 0,
              assets: typeof message.totalAssets === 'number' ? message.totalAssets : 0,
              startTime: new Date()
            }
          }
          return prev
        })

        // Add to activity log
        logIdCounter.current += 1
        const logEntry: LogEntry = {
          id: `${Date.now()}-${logIdCounter.current}`,
          timestamp: new Date(),
          type: message.type,
          message: message.message || getDefaultMessage(message),
          status: message.status,
          progress: message.progress,
          asset: message.asset
        }

        logger.debug('Adding activity log entry', {
          logId: logEntry.id,
          type: logEntry.type,
          status: logEntry.status
        })
        setActivityLog(prev => [logEntry, ...prev])

        // Mark cloning as complete when status is completed or error
        if (message.status === 'completed' || message.status === 'error') {
          setIsCloning(false)
        }

        // Mark cloning as active when resuming
        if (message.status === 'resuming' || message.status === 'crawling') {
          setIsCloning(true)
        }
      } else {
        logger.debug('Ignoring message - session ID mismatch', {
          messageSessionId: message.sessionId,
          currentSessionId: currentSession?.id
        })
      }
    }
  })

  const getDefaultMessage = (message: any): string => {
    switch (message.type) {
      case 'status_update':
        return `Status changed to: ${message.status}`
      case 'progress_update':
        return `Progress: ${Math.round(message.progress || 0)}%`
      case 'asset_found':
        return `Found ${message.asset?.type || 'asset'}: ${message.asset?.url || 'unknown'}`
      default:
        return 'Processing...'
    }
  }

  const { user, loading } = useAuth()
  const [showAdmin, setShowAdmin] = useState(false)

  const handleStartCloning = async (url: string, options: any) => {
    try {
      setIsCloning(true)

      const response = await fetch('/api/clone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ url, options }),
      })

      if (!response.ok) {
        throw new Error('Failed to start cloning')
      }

      const data = await response.json()
      api.response('POST', '/api/clone', response.status, data.sessionId)

      // Store session ID for recovery
      localStorage.setItem('procloner_session_id', data.sessionId)

      setCurrentSession(prev => {
        // If we already have a session with this ID (from WebSocket), merge the data
        if (prev && prev.id === data.sessionId) {
          return {
            ...prev,
            url,
            startTime: new Date(),
          }
        }
        // Otherwise create a new session
        return {
          id: data.sessionId,
          url,
          status: 'starting',
          progress: 0,
          assets: 0,
          startTime: new Date(),
        }
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      api.error('POST', '/api/clone', errorMessage)
      setIsCloning(false)
    }
  }

  const handleReset = () => {
    localStorage.removeItem('procloner_session_id')
    setCurrentSession(null)
    setIsCloning(false)
    setActivityLog([])
    setShowRecoveryDialog(false)
    setRecoverableSession(null)
    logIdCounter.current = 0
  }

  const handleResumeSession = () => {
    if (recoverableSession) {
      logger.info('Resuming session', { sessionId: recoverableSession.sessionId })
      sendMessage({
        type: 'resume_session',
        sessionId: recoverableSession.sessionId
      })
    }
  }

  const handleDiscardSession = () => {
    logger.info('Discarding recoverable session', {
      sessionId: recoverableSession?.sessionId
    })
    localStorage.removeItem('procloner_session_id')
    setShowRecoveryDialog(false)
    setRecoverableSession(null)
    setCurrentSession(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return <GoogleLogin />
  }

  if (showAdmin && user.isAdmin) {
    return <AdminDashboard />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header 
        isConnected={isConnected} 
        connectionStatus={connectionStatus}
        user={user}
        onShowAdmin={() => setShowAdmin(true)}
      />

      {/* Session Recovery Dialog */}
      {showRecoveryDialog && recoverableSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl"
          >
            <h3 className="text-lg font-semibold mb-4 text-gray-900">
              Session Recovery Available
            </h3>
            <p className="text-gray-600 mb-4">
              We found an interrupted cloning session for:
            </p>
            <div className="bg-gray-50 rounded p-3 mb-4">
              <p className="font-medium text-sm">{recoverableSession.url}</p>
              <p className="text-xs text-gray-500">
                Progress: {Math.round(recoverableSession.progress || 0)}% •
                Assets: {recoverableSession.totalAssets || 0}
              </p>
            </div>
            <p className="text-gray-600 mb-6 text-sm">
              Would you like to resume this session or start fresh?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleResumeSession}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Resume Session
              </button>
              <button
                onClick={handleDiscardSession}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Start Fresh
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto"
        >
          {/* Hero Section */}
          <div className="text-center mb-12">
            <motion.h1
              className="text-5xl font-bold mb-4 gradient-text"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              ProCloner
            </motion.h1>
            <motion.p
              className="text-xl text-gray-600 mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              Advanced website cloning with 3D asset support, SPA handling, and modern web technologies
            </motion.p>

            <motion.div
              className="flex flex-wrap justify-center gap-4 text-sm text-gray-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                3D Assets
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                SPA Support
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                Real-time Progress
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                Multiple Exports
              </span>
            </motion.div>
          </div>

          {/* Main Content */}
          <div className="space-y-8">
            {!currentSession ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8 }}
              >
                <URLInput
                  onStartCloning={handleStartCloning}
                  isLoading={isCloning}
                />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Main Progress Section */}
                <div className="space-y-6">
                  <CloningProgress session={currentSession} />

                  {currentSession.status === 'completed' && (
                    <ResultsPanel
                      session={currentSession}
                      onReset={handleReset}
                    />
                  )}

                  {currentSession.status === 'error' && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="card border-red-200 bg-red-50"
                    >
                      <div className="text-center">
                        <div className="text-red-600 text-lg font-medium mb-2">
                          Cloning Failed
                        </div>
                        <div className="text-red-500 mb-4">
                          {currentSession.error || 'An unexpected error occurred'}
                        </div>
                        <button
                          onClick={handleReset}
                          className="btn-primary"
                        >
                          Try Again
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Activity Log Section */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <ActivityLog
                    logs={activityLog}
                    isActive={currentSession.status !== 'completed' && currentSession.status !== 'error'}
                  />
                </motion.div>
              </motion.div>
            )}
          </div>

          {/* Features Section */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 }}
            className="mt-16 grid md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {[
              {
                title: "Smart Asset Discovery",
                description: "Automatically detects 3D models, textures, and dynamic content",
                icon: "🧠"
              },
              {
                title: "SPA Support",
                description: "Handles React, Vue, Angular applications with client-side routing",
                icon: "⚡"
              },
              {
                title: "Real-time Progress",
                description: "Live updates during the cloning process with detailed logs",
                icon: "📊"
              },
              {
                title: "Multiple Exports",
                description: "ZIP, GitHub, VS Code, Docker deployment options",
                icon: "📦"
              }
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 + index * 0.1 }}
                className="card text-center"
              >
                <div className="text-3xl mb-3">{feature.icon}</div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
