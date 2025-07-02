// Shared UI components for consistent styling and behavior

import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, Info, AlertCircle, Loader2 } from 'lucide-react';

// Loading Spinner Component
export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  text?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  className = '', 
  text 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={`flex items-center justify-center space-x-2 ${className}`}>
      <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-500`} />
      {text && <span className="text-sm text-gray-600">{text}</span>}
    </div>
  );
};

// Alert Component
export interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  className?: string;
  onClose?: () => void;
  actions?: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({ 
  type, 
  title, 
  message, 
  className = '', 
  onClose,
  actions 
}) => {
  const config = {
    success: {
      icon: CheckCircle,
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      iconColor: 'text-green-600',
      titleColor: 'text-green-800',
      messageColor: 'text-green-700'
    },
    error: {
      icon: AlertCircle,
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      iconColor: 'text-red-600',
      titleColor: 'text-red-800',
      messageColor: 'text-red-700'
    },
    warning: {
      icon: AlertTriangle,
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      iconColor: 'text-yellow-600',
      titleColor: 'text-yellow-800',
      messageColor: 'text-yellow-700'
    },
    info: {
      icon: Info,
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      iconColor: 'text-blue-600',
      titleColor: 'text-blue-800',
      messageColor: 'text-blue-700'
    }
  };

  const { icon: Icon, bgColor, borderColor, iconColor, titleColor, messageColor } = config[type];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`rounded-lg border-2 p-4 ${bgColor} ${borderColor} ${className}`}
    >
      <div className="flex items-start space-x-3">
        <Icon className={`w-5 h-5 mt-0.5 ${iconColor} flex-shrink-0`} />
        <div className="flex-grow">
          {title && (
            <h4 className={`font-medium ${titleColor} mb-1`}>{title}</h4>
          )}
          <p className={`text-sm ${messageColor}`}>{message}</p>
          {actions && (
            <div className="mt-3 flex space-x-2">
              {actions}
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`${iconColor} hover:opacity-75 transition-opacity flex-shrink-0`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
};

// Error Fallback Component
export interface ErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
  title?: string;
  message?: string;
  showDetails?: boolean;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ 
  error, 
  resetError, 
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  showDetails = false
}) => {
  return (
    <div className="min-h-[200px] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
        
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-4">{message}</p>
        
        {showDetails && error && (
          <details className="mb-4 text-left">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
              Error Details
            </summary>
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm">
              <div className="font-mono text-red-800 mb-1">{error.name}: {error.message}</div>
              {error.stack && (
                <pre className="text-xs text-red-700 overflow-auto max-h-32 whitespace-pre-wrap">
                  {error.stack}
                </pre>
              )}
            </div>
          </details>
        )}
        
        {resetError && (
          <button
            onClick={resetError}
            className="btn-primary"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
};

// Card Component with consistent styling
export interface CardProps {
  children?: React.ReactNode;
  className?: string;
  loading?: boolean;
  error?: string;
  title?: string;
  actions?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  className = '', 
  loading, 
  error, 
  title,
  actions 
}) => {
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`card ${className}`}
      >
        <LoadingSpinner size="md" text="Loading..." />
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`card ${className}`}
      >
        <Alert type="error" message={error} />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card ${className}`}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
          {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
          {actions && <div className="flex space-x-2">{actions}</div>}
        </div>
      )}
      {children}
    </motion.div>
  );
};

// Progress Bar Component
export interface ProgressBarProps {
  progress: number;
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'red' | 'yellow';
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ 
  progress, 
  size = 'md',
  color = 'blue',
  showLabel = true,
  animated = true,
  className = ''
}) => {
  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4'
  };

  const colorClasses = {
    blue: 'bg-gradient-to-r from-blue-500 to-blue-600',
    green: 'bg-gradient-to-r from-green-500 to-green-600',
    red: 'bg-gradient-to-r from-red-500 to-red-600',
    yellow: 'bg-gradient-to-r from-yellow-500 to-yellow-600'
  };

  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div className={className}>
      {showLabel && (
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Progress</span>
          <span>{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full ${sizeClasses[size]}`}>
        <motion.div
          className={`${sizeClasses[size]} rounded-full ${colorClasses[color]}`}
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={animated ? { duration: 0.5, ease: "easeOut" } : { duration: 0 }}
        />
      </div>
    </div>
  );
};

// Status Badge Component
export interface StatusBadgeProps {
  status: 'success' | 'error' | 'warning' | 'info' | 'pending';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', children }) => {
  const baseClasses = 'inline-flex items-center font-medium rounded-full';
  
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  const statusClasses = {
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    warning: 'bg-yellow-100 text-yellow-800',
    info: 'bg-blue-100 text-blue-800',
    pending: 'bg-gray-100 text-gray-800'
  };

  return (
    <span className={`${baseClasses} ${sizeClasses[size]} ${statusClasses[status]}`}>
      {children}
    </span>
  );
};