export interface CloningSession {
  id: string
  url: string
  status: 'starting' | 'crawling' | 'processing' | 'completed' | 'error' | 'interrupted' | 'resuming' | 'timeout'
  progress: number
  assets: number
  startTime: Date
  completedAt?: Date
  error?: string
  canRecover?: boolean
}

export interface Asset {
  url: string
  type: AssetType
  contentType: string
  size: number
  discoveredAt: Date
  downloaded?: boolean
  localPath?: string
  metadata?: AssetMetadata
  frameworks?: string[]
  textureType?: string
  error?: string
}

export type AssetType =
  | '3d-model'
  | 'environment-map'
  | 'texture'
  | 'video'
  | 'audio'
  | 'image'
  | 'javascript'
  | 'stylesheet'
  | 'html'
  | 'font'
  | 'other'

export interface AssetMetadata {
  width?: number
  height?: number
  format?: string
  size?: number
}

export interface CloningOptions {
  depth?: number
  includeAssets?: AssetType[]
  optimizeImages?: boolean
  generateServiceWorker?: boolean
  exportFormat?: ExportFormat[]
}

export type ExportFormat = 'zip' | 'github' | 'vscode' | 'docker' | 'netlify'

export interface WebSocketMessage {
  type: 'status_update' | 'progress_update' | 'asset_found' | 'error' | 'session_not_found' |
        'connection_status' | 'session_recovery_available' | 'session_resumed' | 'session_resume_failed'
  sessionId?: string
  status?: CloningSession['status']
  progress?: number
  message?: string
  asset?: Asset
  totalAssets?: number
  error?: string
  url?: string
  startTime?: Date | string
  canRecover?: boolean
  timestamp?: Date | string
}

export interface LogEntry {
  id: string
  timestamp: Date
  type: WebSocketMessage['type']
  message: string
  status?: CloningSession['status']
  progress?: number
  asset?: Asset
}

export interface CloningResult {
  sessionId: string
  success: boolean
  assetsFound: number
  pagesVisited: number
  downloadUrl?: string
  previewUrl?: string
  error?: string
}
