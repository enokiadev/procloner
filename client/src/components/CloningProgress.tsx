import React from 'react'
import { motion } from 'framer-motion'
import { Globe, Package, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { CloningSession } from '../types'
import { Card, ProgressBar, StatusBadge, Alert } from './shared/index'
import { useErrorHandler } from '../hooks/useErrorHandler'

interface CloningProgressProps {
  session: CloningSession
}

const CloningProgress: React.FC<CloningProgressProps> = ({ session }) => {
  const { isError, errorMessage, handleError } = useErrorHandler('CloningProgress');

  // Validate session data
  React.useEffect(() => {
    if (!session?.id) {
      handleError('Invalid session data provided');
    }
  }, [session, handleError]);
  const getStatusIcon = () => {
    switch (session.status) {
      case 'starting':
        return <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      case 'crawling':
        return <Globe className="w-6 h-6 text-blue-500 animate-pulse" />
      case 'processing':
        return <Package className="w-6 h-6 text-purple-500 animate-bounce" />
      case 'completed':
        return <CheckCircle className="w-6 h-6 text-green-500" />
      case 'error':
        return <AlertCircle className="w-6 h-6 text-red-500" />
      default:
        return <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
    }
  }

  const getStatusMessage = () => {
    const assetCount = session.assets || 0;
    switch (session.status) {
      case 'starting':
        return 'Initializing browser and preparing to crawl...'
      case 'crawling':
        return `Discovering and downloading assets... (${assetCount} found)`
      case 'processing':
        return 'Processing assets and building package...'
      case 'completed':
        return `🎉 Cloning completed successfully! Found ${assetCount} assets.`
      case 'error':
        return session.error || 'An error occurred during cloning'
      case 'timeout':
        return 'Cloning timed out. Please try again with a simpler website.'
      case 'interrupted':
        return 'Cloning was interrupted. You can resume this session.'
      default:
        return 'Processing...'
    }
  }

  const getStatusBadgeType = (): 'success' | 'error' | 'warning' | 'info' | 'pending' => {
    switch (session.status) {
      case 'completed': return 'success';
      case 'error': return 'error';
      case 'timeout': return 'warning';
      case 'interrupted': return 'warning';
      default: return 'pending';
    }
  }

  const steps = [
    { key: 'starting', label: 'Initialize', icon: Loader2 },
    { key: 'crawling', label: 'Crawl & Discover', icon: Globe },
    { key: 'processing', label: 'Process Assets', icon: Package },
    { key: 'completed', label: 'Complete', icon: CheckCircle }
  ]

  const getCurrentStepIndex = () => {
    return steps.findIndex(step => step.key === session.status)
  }

  // Show error state if component has errors
  if (isError) {
    return (
      <Card>
        <Alert type="error" message={errorMessage} />
      </Card>
    );
  }

  // Show loading state if session is invalid
  if (!session?.id) {
    return <Card loading={true} />;
  }

  const progressColor = session.status === 'completed' ? 'green' : 
                       session.status === 'error' ? 'red' : 'blue';

  return (
    <Card className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          {getStatusIcon()}
          <div>
            <h3 className="font-semibold text-lg">Cloning Website</h3>
            <p className="text-sm text-gray-600">{session.url}</p>
          </div>
        </div>
        <div className="text-right">
          <StatusBadge status={getStatusBadgeType()} size="sm">
            {session.status}
          </StatusBadge>
          <motion.div
            className={`text-2xl font-bold mt-2 ${
              session.status === 'completed' ? 'text-green-600' : 'text-primary-600'
            }`}
            animate={{
              scale: session.status === 'completed' ? [1, 1.1, 1] : 1
            }}
            transition={{ duration: 0.5 }}
          >
            {Math.round(session.progress || 0)}%
          </motion.div>
          <div className="text-xs text-gray-500">
            {session.assets || 0} asset{(session.assets || 0) !== 1 ? 's' : ''} found
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <ProgressBar 
        progress={session.progress || 0}
        color={progressColor}
        size="md"
        showLabel={true}
        animated={true}
        className="mb-6"
      />

      {/* Status Message */}
      <div className="mb-6">
        <motion.p
          key={session.status}
          initial={{ opacity: 0, y: 10 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: session.status === 'completed' ? [1, 1.02, 1] : 1
          }}
          transition={{
            duration: session.status === 'completed' ? 0.6 : 0.3,
            ease: "easeOut"
          }}
          className={`${
            session.status === 'completed'
              ? 'text-green-700 font-medium'
              : 'text-gray-700'
          }`}
        >
          {getStatusMessage()}
        </motion.p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = index <= getCurrentStepIndex()
          const isCurrent = index === getCurrentStepIndex()
          const StepIcon = step.icon

          return (
            <div key={step.key} className="flex items-center">
              <motion.div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  isActive
                    ? 'border-primary-500 bg-primary-500 text-white'
                    : 'border-gray-300 bg-white text-gray-400'
                }`}
                animate={{
                  scale: isCurrent ? 1.1 : 1,
                  borderColor: isActive ? '#3b82f6' : '#d1d5db',
                  backgroundColor: isActive ? '#3b82f6' : '#ffffff'
                }}
                transition={{ duration: 0.3 }}
              >
                <StepIcon className={`w-5 h-5 ${isCurrent && session.status !== 'completed' ? 'animate-pulse' : ''}`} />
              </motion.div>

              {index < steps.length - 1 && (
                <motion.div
                  className={`w-16 h-0.5 mx-2 ${
                    isActive ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: isActive ? 1 : 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Step Labels */}
      <div className="flex justify-between mt-2">
        {steps.map((step) => (
          <div key={step.key} className="text-xs text-gray-500 text-center w-10">
            {step.label}
          </div>
        ))}
      </div>

      {/* Time Information */}
      <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between text-sm text-gray-500">
        <span>Started: {session.startTime?.toLocaleTimeString() || 'Unknown'}</span>
        {session.completedAt && session.startTime && (
          <span>
            Completed in: {Math.round((session.completedAt.getTime() - session.startTime.getTime()) / 1000)}s
          </span>
        )}
      </div>

      {/* Error Alert */}
      {session.status === 'error' && session.error && (
        <div className="mt-4">
          <Alert 
            type="error" 
            title="Cloning Failed"
            message={session.error}
          />
        </div>
      )}

      {/* Timeout Alert */}
      {session.status === 'timeout' && (
        <div className="mt-4">
          <Alert 
            type="warning" 
            title="Session Timed Out"
            message="The cloning process took too long and was stopped. Try with a simpler website or contact support."
          />
        </div>
      )}
    </Card>
  )
}

export default CloningProgress
