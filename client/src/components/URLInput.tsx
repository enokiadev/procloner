import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Globe, Settings, Zap } from 'lucide-react'
import { CloningOptions } from '../types'
import { Card, Alert, LoadingSpinner } from './shared/index'
import { useErrorHandler } from '../hooks/useErrorHandler'

interface URLInputProps {
  onStartCloning: (url: string, options: CloningOptions) => void
  isLoading: boolean
}

const URLInput: React.FC<URLInputProps> = ({ onStartCloning, isLoading }) => {
  const [url, setUrl] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const { withErrorHandling } = useErrorHandler('URLInput');
  const [options, setOptions] = useState<CloningOptions>({
    depth: 3,
    includeAssets: ['3d-model', 'texture', 'video', 'audio', 'image', 'javascript', 'stylesheet', 'font'],
    optimizeImages: true,
    generateServiceWorker: true,
    exportFormat: ['zip']
  })

  const handleSubmit = withErrorHandling(async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    
    const validation = isValidUrl(url);
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid URL');
      return;
    }
    
    if (!isLoading) {
      await onStartCloning(url.trim(), options);
    }
  }, { action: 'submit' });

  const isValidUrl = (urlString: string): { valid: boolean; error?: string } => {
    if (!urlString.trim()) {
      return { valid: false, error: 'URL is required' };
    }
    
    try {
      const parsedUrl = new URL(urlString);
      
      // Check protocol
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
      }
      
      // Check for localhost in production
      if (import.meta.env.PROD && ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsedUrl.hostname)) {
        return { valid: false, error: 'Local URLs are not allowed in production' };
      }
      
      return { valid: true };
    } catch {
      return { valid: false, error: 'Please enter a valid URL (e.g., https://example.com)' };
    }
  }

  // Get example URLs from environment variables
  const getExampleUrls = (): string[] => {
    const envUrls = import.meta.env.REACT_APP_EXAMPLE_URLS;
    if (!envUrls) {
      return []; // No hardcoded fallbacks in production
    }
    return envUrls.split(',').map((url: string) => url.trim()).filter(Boolean);
  };

  const exampleUrls = getExampleUrls();

  // Validate URL on change
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    
    // Clear validation error when user starts typing
    if (validationError && newUrl !== url) {
      setValidationError(null);
    }
  };

  const urlValidation = isValidUrl(url);
  const hasValidationError = validationError || (!urlValidation.valid && url.trim().length > 0);
  const errorMessage = validationError || urlValidation.error;

  return (
    <Card className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* URL Input */}
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
            Website URL
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="url"
              id="url"
              value={url}
              onChange={handleUrlChange}
              placeholder="https://example.com"
              className={`input pl-10 ${
                hasValidationError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
              }`}
              required
              aria-invalid={hasValidationError ? 'true' : 'false'}
              aria-describedby={hasValidationError ? 'url-error' : undefined}
            />
          </div>
          
          {/* Validation Error */}
          {hasValidationError && (
            <div id="url-error" className="mt-2">
              <Alert type="error" message={errorMessage!} />
            </div>
          )}
          
          {/* Example URLs */}
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-2">Try these examples:</p>
            <div className="flex flex-wrap gap-2">
              {exampleUrls.map((exampleUrl) => (
                <button
                  key={exampleUrl}
                  type="button"
                  onClick={() => setUrl(exampleUrl)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded transition-colors"
                >
                  {exampleUrl.replace('https://', '')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Advanced Options Toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>Advanced Options</span>
            <motion.div
              animate={{ rotate: showAdvanced ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              ▼
            </motion.div>
          </button>
        </div>

        {/* Advanced Options Panel */}
        <motion.div
          initial={false}
          animate={{ height: showAdvanced ? 'auto' : 0, opacity: showAdvanced ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden"
        >
          <div className="space-y-4 pt-4 border-t border-gray-200">
            {/* Crawl Depth */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Crawl Depth: {options.depth}
              </label>
              <input
                type="range"
                min="1"
                max="5"
                value={options.depth}
                onChange={(e) => setOptions(prev => ({ ...prev, depth: parseInt(e.target.value) }))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Shallow (1)</span>
                <span>Deep (5)</span>
              </div>
            </div>

            {/* Asset Types */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Asset Types to Include
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: '3d-model', label: '3D Models', icon: '🎮' },
                  { key: 'texture', label: 'Textures', icon: '🎨' },
                  { key: 'video', label: 'Videos', icon: '🎬' },
                  { key: 'audio', label: 'Audio', icon: '🔊' },
                  { key: 'image', label: 'Images', icon: '🖼️' },
                  { key: 'font', label: 'Fonts', icon: '🔤' }
                ].map((asset) => (
                  <label key={asset.key} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={options.includeAssets?.includes(asset.key as any)}
                      onChange={(e) => {
                        const newAssets = e.target.checked
                          ? [...(options.includeAssets || []), asset.key]
                          : (options.includeAssets || []).filter(a => a !== asset.key)
                        setOptions(prev => ({ ...prev, includeAssets: newAssets as any }))
                      }}
                      className="rounded"
                    />
                    <span>{asset.icon}</span>
                    <span>{asset.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Export Options */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Export Formats
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'zip', label: 'ZIP Archive', icon: '📦' },
                  { key: 'vscode', label: 'VS Code Project', icon: '💻' },
                  { key: 'docker', label: 'Docker Container', icon: '🐳' },
                  { key: 'netlify', label: 'Netlify Deploy', icon: '🌐' }
                ].map((format) => (
                  <label key={format.key} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={options.exportFormat?.includes(format.key as any)}
                      onChange={(e) => {
                        const newFormats = e.target.checked
                          ? [...(options.exportFormat || []), format.key]
                          : (options.exportFormat || []).filter(f => f !== format.key)
                        setOptions(prev => ({ ...prev, exportFormat: newFormats as any }))
                      }}
                      className="rounded"
                    />
                    <span>{format.icon}</span>
                    <span>{format.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Additional Options */}
            <div className="space-y-2">
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.optimizeImages}
                  onChange={(e) => setOptions(prev => ({ ...prev, optimizeImages: e.target.checked }))}
                  className="rounded"
                />
                <span>Optimize images for web</span>
              </label>
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={options.generateServiceWorker}
                  onChange={(e) => setOptions(prev => ({ ...prev, generateServiceWorker: e.target.checked }))}
                  className="rounded"
                />
                <span>Generate service worker for offline support</span>
              </label>
            </div>
          </div>
        </motion.div>

        {/* Submit Button */}
        <motion.button
          type="submit"
          disabled={!urlValidation.valid || isLoading || !!hasValidationError}
          className={`w-full flex items-center justify-center space-x-2 py-3 transition-all ${
            !urlValidation.valid || isLoading || hasValidationError
              ? 'btn-disabled cursor-not-allowed'
              : 'btn-primary hover:scale-102'
          }`}
          whileHover={!urlValidation.valid || isLoading ? {} : { scale: 1.02 }}
          whileTap={!urlValidation.valid || isLoading ? {} : { scale: 0.98 }}
        >
          {isLoading ? (
            <LoadingSpinner size="sm" text="Starting Clone..." />
          ) : (
            <>
              <Zap className="w-5 h-5" />
              <span>Start Cloning</span>
            </>
          )}
        </motion.button>
      </form>
    </Card>
  )
}

export default URLInput
