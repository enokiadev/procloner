import React from 'react'
import { motion } from 'framer-motion'
import { Github, Star, Zap, Wifi, WifiOff, RotateCcw, Settings, LogOut, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface HeaderProps {
  isConnected?: boolean
  connectionStatus?: 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
  user?: any
  onShowAdmin?: () => void
  onBackToMain?: () => void
}

const Header: React.FC<HeaderProps> = ({ 
  connectionStatus = 'connecting', 
  user, 
  onShowAdmin, 
  onBackToMain 
}) => {
  const { logout } = useAuth()
  return (
    <motion.header
      className="bg-white border-b border-gray-200 sticky top-0 z-50"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <motion.div
            className="flex items-center space-x-3"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">ProCloner</h1>
              <p className="text-xs text-gray-500">Advanced Website Cloning</p>
            </div>
          </motion.div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <a
              href="#features"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Features
            </a>
            <a
              href="#docs"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Documentation
            </a>
            <a
              href="#api"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              API
            </a>
          </nav>

          {/* Actions */}
          <div className="flex items-center space-x-4">
            {/* User Menu */}
            {user && (
              <div className="flex items-center space-x-3">
                <img 
                  src={user.photo} 
                  alt={user.name}
                  className="w-8 h-8 rounded-full"
                />
                <div className="hidden md:block">
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
                
                {user.isAdmin && (
                  <button
                    onClick={onShowAdmin}
                    className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="hidden md:inline">Admin</span>
                  </button>
                )}
                
                <button
                  onClick={logout}
                  className="flex items-center space-x-1 text-gray-600 hover:text-gray-800 text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden md:inline">Logout</span>
                </button>
              </div>
            )}
            {/* Enhanced Connection Status */}
            <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
              connectionStatus === 'connected'
                ? 'bg-green-100 text-green-800'
                : connectionStatus === 'reconnecting'
                ? 'bg-yellow-100 text-yellow-800'
                : connectionStatus === 'connecting'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {connectionStatus === 'connected' ? (
                <Wifi className="w-3 h-3" />
              ) : connectionStatus === 'reconnecting' ? (
                <RotateCcw className="w-3 h-3 animate-spin" />
              ) : connectionStatus === 'connecting' ? (
                <RotateCcw className="w-3 h-3 animate-spin" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              <span className="hidden sm:inline capitalize">
                {connectionStatus}
              </span>
            </div>

            <motion.a
              href="https://github.com/procloner/procloner"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Github className="w-5 h-5" />
              <span className="hidden sm:inline">GitHub</span>
            </motion.a>

            {!user && (
              <motion.button
                className="flex items-center space-x-2 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Star className="w-4 h-4" />
                <span>Star</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </motion.header>
  )
}

export default Header
