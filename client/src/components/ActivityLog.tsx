import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Globe, 
  Package, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Download,
  Image,
  Video,
  Music,
  FileText,
  Palette,
  Box,
  Zap
} from 'lucide-react'
import { LogEntry } from '../types'

interface ActivityLogProps {
  logs: LogEntry[]
  isActive: boolean
}

const ActivityLog: React.FC<ActivityLogProps> = ({ logs, isActive }) => {
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to top when new logs are added
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0
    }
  }, [logs])

  const getLogIcon = (entry: LogEntry) => {
    if (entry.asset) {
      switch (entry.asset.type) {
        case '3d-model':
          return <Box className="w-4 h-4 text-purple-500" />
        case 'environment-map':
          return <Globe className="w-4 h-4 text-blue-500" />
        case 'texture':
          return <Palette className="w-4 h-4 text-pink-500" />
        case 'image':
          return <Image className="w-4 h-4 text-green-500" />
        case 'video':
          return <Video className="w-4 h-4 text-red-500" />
        case 'audio':
          return <Music className="w-4 h-4 text-yellow-500" />
        case 'javascript':
          return <Zap className="w-4 h-4 text-orange-500" />
        case 'stylesheet':
          return <FileText className="w-4 h-4 text-blue-400" />
        default:
          return <Download className="w-4 h-4 text-gray-500" />
      }
    }

    switch (entry.type) {
      case 'status_update':
        if (entry.status === 'completed') {
          return <CheckCircle className="w-4 h-4 text-green-500" />
        } else if (entry.status === 'error') {
          return <AlertCircle className="w-4 h-4 text-red-500" />
        } else {
          return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
        }
      case 'progress_update':
        return <Package className="w-4 h-4 text-purple-500" />
      case 'asset_found':
        return <Download className="w-4 h-4 text-green-500" />
      default:
        return <Loader2 className="w-4 h-4 text-gray-500" />
    }
  }

  const getLogColor = (entry: LogEntry) => {
    if (entry.asset) {
      switch (entry.asset.type) {
        case '3d-model':
          return 'border-l-purple-500 bg-purple-50'
        case 'environment-map':
          return 'border-l-blue-500 bg-blue-50'
        case 'texture':
          return 'border-l-pink-500 bg-pink-50'
        case 'image':
          return 'border-l-green-500 bg-green-50'
        case 'video':
          return 'border-l-red-500 bg-red-50'
        case 'audio':
          return 'border-l-yellow-500 bg-yellow-50'
        default:
          return 'border-l-gray-500 bg-gray-50'
      }
    }

    switch (entry.type) {
      case 'status_update':
        if (entry.status === 'completed') {
          return 'border-l-green-500 bg-green-50'
        } else if (entry.status === 'error') {
          return 'border-l-red-500 bg-red-50'
        } else {
          return 'border-l-blue-500 bg-blue-50'
        }
      case 'progress_update':
        return 'border-l-purple-500 bg-purple-50'
      case 'asset_found':
        return 'border-l-green-500 bg-green-50'
      default:
        return 'border-l-gray-500 bg-gray-50'
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    })
  }

  const getAssetFileName = (url: string) => {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname
      return pathname.split('/').pop() || 'unknown'
    } catch {
      return url.split('/').pop() || 'unknown'
    }
  }

  return (
    <motion.div
      className="card h-96"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg flex items-center space-x-2">
          <FileText className="w-5 h-5" />
          <span>Activity Log</span>
        </h3>
        <div className="flex items-center space-x-2">
          {isActive && (
            <div className="flex items-center space-x-1 text-sm text-green-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Live</span>
            </div>
          )}
          <span className="text-sm text-gray-500">{logs.length} entries</span>
        </div>
      </div>

      <div 
        ref={logContainerRef}
        className="h-80 overflow-y-auto space-y-2 pr-2"
        style={{ scrollbarWidth: 'thin' }}
      >
        <AnimatePresence initial={false}>
          {logs.map((entry, index) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, delay: index * 0.02 }}
              className={`p-3 rounded-lg border-l-4 ${getLogColor(entry)} transition-all duration-200`}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getLogIcon(entry)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                      {entry.type.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {entry.message}
                  </p>
                  {entry.asset && (
                    <div className="mt-2 text-xs text-gray-600">
                      <span className="font-medium">{entry.asset.type}:</span>{' '}
                      <span className="font-mono bg-gray-100 px-1 rounded">
                        {getAssetFileName(entry.asset.url)}
                      </span>
                    </div>
                  )}
                  {typeof entry.progress === 'number' && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                        <span>Progress</span>
                        <span>{Math.round(entry.progress)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1">
                        <div 
                          className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                          style={{ width: `${entry.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {logs.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Activity log will appear here during cloning</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default ActivityLog
