import { useEffect, useRef, useState } from 'react'
import { WebSocketMessage } from '../types'

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
  reconnectAttempts?: number
  reconnectInterval?: number
}

export const useWebSocket = (url: string, options: UseWebSocketOptions = {}) => {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const ws = useRef<WebSocket | null>(null)
  const reconnectCount = useRef(0)
  const maxReconnectAttempts = options.reconnectAttempts || 5
  const reconnectInterval = options.reconnectInterval || 3000

  const connect = () => {
    try {
      ws.current = new WebSocket(url)
      
      ws.current.onopen = () => {
        setIsConnected(true)
        setError(null)
        reconnectCount.current = 0
        options.onOpen?.()
      }
      
      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          setLastMessage(message)
          options.onMessage?.(message)
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err)
        }
      }
      
      ws.current.onclose = () => {
        setIsConnected(false)
        options.onClose?.()
        
        // Attempt to reconnect
        if (reconnectCount.current < maxReconnectAttempts) {
          setTimeout(() => {
            reconnectCount.current++
            connect()
          }, reconnectInterval)
        }
      }
      
      ws.current.onerror = (error) => {
        setError('WebSocket connection error')
        options.onError?.(error)
      }
      
    } catch (err) {
      setError('Failed to create WebSocket connection')
    }
  }

  const sendMessage = (message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message))
    }
  }

  const disconnect = () => {
    if (ws.current) {
      ws.current.close()
    }
  }

  useEffect(() => {
    connect()
    
    return () => {
      disconnect()
    }
  }, [url])

  return {
    isConnected,
    lastMessage,
    error,
    sendMessage,
    disconnect
  }
}
