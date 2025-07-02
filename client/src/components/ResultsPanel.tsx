import React from 'react'
import { motion } from 'framer-motion'
import { Download, Eye, Github, Code, Package, Globe, RefreshCw } from 'lucide-react'
import { CloningSession } from '../types'

interface ResultsPanelProps {
  session: CloningSession
  onReset: () => void
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({ session, onReset }) => {
  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/download/${session.id}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${session.url.replace(/[^a-zA-Z0-9]/g, '_')}.zip`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  const handlePreview = () => {
    // This would open a preview window/iframe
    window.open(`/api/preview/${session.id}`, '_blank')
  }

  const exportOptions = [
    {
      icon: Download,
      title: 'Download ZIP',
      description: 'Complete website package ready to deploy',
      action: handleDownload,
      primary: true
    },
    {
      icon: Eye,
      title: 'Live Preview',
      description: 'Preview the cloned website in browser',
      action: handlePreview,
      primary: false
    },
    {
      icon: Code,
      title: 'Open in VS Code',
      description: 'Open as VS Code project with dev server',
      action: () => console.log('VS Code integration'),
      primary: false
    },
    {
      icon: Github,
      title: 'Deploy to GitHub',
      description: 'Create repository and deploy to GitHub Pages',
      action: () => console.log('GitHub deployment'),
      primary: false
    }
  ]

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Success Header */}
      <motion.div
        className="card bg-gradient-to-r from-green-50 to-emerald-50 border-green-200"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="text-center">
          <motion.div
            className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
          >
            <Package className="w-8 h-8 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold text-green-800 mb-2">
            Website Cloned Successfully!
          </h2>
          <p className="text-green-700 mb-4">
            {session.assets} assets discovered and downloaded
          </p>
          <div className="flex justify-center space-x-6 text-sm text-green-600">
            <span className="flex items-center gap-1">
              <Globe className="w-4 h-4" />
              {session.url}
            </span>
            <span>
              Completed in {session.completedAt && Math.round((session.completedAt.getTime() - session.startTime.getTime()) / 1000)}s
            </span>
          </div>
        </div>
      </motion.div>

      {/* Export Options */}
      <div className="grid md:grid-cols-2 gap-4">
        {exportOptions.map((option, index) => (
          <motion.button
            key={option.title}
            onClick={option.action}
            className={`card text-left hover:shadow-md transition-all duration-200 ${
              option.primary 
                ? 'ring-2 ring-primary-500 bg-primary-50' 
                : 'hover:bg-gray-50'
            }`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + index * 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-start space-x-4">
              <div className={`p-3 rounded-lg ${
                option.primary 
                  ? 'bg-primary-500 text-white' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                <option.icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">
                  {option.title}
                </h3>
                <p className="text-sm text-gray-600">
                  {option.description}
                </p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Asset Summary */}
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0 }}
      >
        <h3 className="font-semibold text-lg mb-4">Asset Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { type: '3D Models', count: 2, icon: '🎮', color: 'text-purple-600' },
            { type: 'Textures', count: 8, icon: '🎨', color: 'text-pink-600' },
            { type: 'Images', count: 24, icon: '🖼️', color: 'text-blue-600' },
            { type: 'Videos', count: 3, icon: '🎬', color: 'text-green-600' }
          ].map((asset) => (
            <div key={asset.type} className="text-center">
              <div className="text-2xl mb-1">{asset.icon}</div>
              <div className={`text-2xl font-bold ${asset.color}`}>
                {asset.count}
              </div>
              <div className="text-sm text-gray-600">{asset.type}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Actions */}
      <motion.div
        className="flex justify-center space-x-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        <button
          onClick={onReset}
          className="btn-secondary flex items-center space-x-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Clone Another Website</span>
        </button>
      </motion.div>
    </motion.div>
  )
}

export default ResultsPanel
