/**
 * Dynamic configuration for ProCloner client
 * Automatically detects the correct API and WebSocket URLs based on environment
 */

interface AppConfig {
  apiBaseUrl: string
  wsUrl: string
  isDevelopment: boolean
}

/**
 * Get the current host and port information
 */
function getCurrentHost(): { host: string; port: string; protocol: string } {
  const { hostname, port, protocol } = window.location
  return {
    host: hostname,
    port: port || (protocol === 'https:' ? '443' : '80'),
    protocol: protocol.replace(':', '')
  }
}

/**
 * Determine the API server port based on current environment
 */
function getApiPort(): string {
  const { port } = getCurrentHost()
  
  // If we're running on Vite's default port (5173), API is likely on 3002
  if (port === '5173') {
    return '3002'
  }
  
  // If we're running on port 3000, API is likely on 3001
  if (port === '3000') {
    return '3001'
  }
  
  // For production or other environments, try common API ports
  if (port === '80' || port === '443') {
    // In production, API might be on the same port with /api prefix
    return port
  }
  
  // Default fallback - assume API is on port + 1
  const apiPort = parseInt(port) + 1
  return apiPort.toString()
}

/**
 * Build the API base URL
 */
function buildApiUrl(): string {
  // Check for explicit environment variable first
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }
  
  const { host, protocol } = getCurrentHost()
  const apiPort = getApiPort()
  
  // For development, use explicit port
  if (import.meta.env.DEV) {
    return `${protocol}://${host}:${apiPort}`
  }
  
  // For production, might be same host with /api prefix
  return `${protocol}://${host}${apiPort !== '80' && apiPort !== '443' ? `:${apiPort}` : ''}`
}

/**
 * Build the WebSocket URL
 */
function buildWebSocketUrl(): string {
  // Check for explicit environment variable first
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }
  
  const { host, protocol } = getCurrentHost()
  const apiPort = getApiPort()
  
  // Convert HTTP protocol to WebSocket protocol
  const wsProtocol = protocol === 'https' ? 'wss' : 'ws'
  
  return `${wsProtocol}://${host}:${apiPort}`
}

/**
 * Get the complete application configuration
 */
export function getAppConfig(): AppConfig {
  return {
    apiBaseUrl: buildApiUrl(),
    wsUrl: buildWebSocketUrl(),
    isDevelopment: import.meta.env.DEV
  }
}

/**
 * Log configuration for debugging
 */
export function logConfig(): void {
  const config = getAppConfig()
  console.log('🔧 ProCloner Configuration:', {
    ...config,
    currentLocation: window.location.href,
    environment: import.meta.env.MODE
  })
}

// Export individual getters for convenience
export const getApiUrl = () => getAppConfig().apiBaseUrl
export const getWebSocketUrl = () => getAppConfig().wsUrl
export const isDev = () => getAppConfig().isDevelopment
