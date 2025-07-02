// Frontend logging utility for ProCloner

interface LogContext {
  sessionId?: string;
  component?: string;
  action?: string;
  [key: string]: any;
}

class Logger {
  private isProduction: boolean;

  constructor() {
    this.isProduction = import.meta.env.PROD;
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    // In production, only log warnings and errors
    if (this.isProduction) {
      return level === 'warn' || level === 'error';
    }
    
    // In development, log everything
    return true;
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, context));
    }
    
    // In production, could send to error reporting service
    if (this.isProduction && context?.error) {
      this.reportError(message, context);
    }
  }

  private reportError(_message: string, _context: LogContext): void {
    // This would integrate with an error reporting service like Sentry
    // For now, we'll just ensure the error is captured
    try {
      // Could send to /api/error-report endpoint
      // const errorData = {
      //   message,
      //   context,
      //   userAgent: navigator.userAgent,
      //   url: window.location.href,
      //   timestamp: new Date().toISOString()
      // };

      // In a real implementation, you'd send this to your error tracking service
      // fetch('/api/error-report', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorData)
      // }).catch(() => {
      //   // Silently fail if error reporting fails
      // });
    } catch (e) {
      // Silently fail if error reporting fails
    }
  }

  // WebSocket specific logging
  websocket = {
    connected: (url: string) => this.info('WebSocket connected', { component: 'WebSocket', url }),
    disconnected: () => this.warn('WebSocket disconnected', { component: 'WebSocket' }),
    reconnecting: () => this.info('WebSocket reconnecting', { component: 'WebSocket' }),
    messageReceived: (type: string, sessionId?: string) => 
      this.debug('WebSocket message received', { component: 'WebSocket', messageType: type, sessionId }),
    messageSent: (type: string, sessionId?: string) =>
      this.debug('WebSocket message sent', { component: 'WebSocket', messageType: type, sessionId }),
    error: (error: Event) => this.error('WebSocket error', { component: 'WebSocket', error })
  };

  // Session specific logging
  session = {
    created: (sessionId: string, url: string) => 
      this.info('Session created', { component: 'Session', sessionId, url }),
    recovered: (sessionId: string) =>
      this.info('Session recovered', { component: 'Session', sessionId }),
    completed: (sessionId: string, assets: number) =>
      this.info('Session completed', { component: 'Session', sessionId, assets }),
    failed: (sessionId: string, error: string) =>
      this.error('Session failed', { component: 'Session', sessionId, error }),
    reset: () => this.info('Session reset', { component: 'Session' })
  };

  // API specific logging
  api = {
    request: (method: string, url: string, sessionId?: string) =>
      this.debug('API request', { component: 'API', method, url, sessionId }),
    response: (method: string, url: string, status: number, sessionId?: string) =>
      this.debug('API response', { component: 'API', method, url, status, sessionId }),
    error: (method: string, url: string, error: string, sessionId?: string) =>
      this.error('API error', { component: 'API', method, url, error, sessionId })
  };
}

// Export singleton instance
export const logger = new Logger();

// Export specific loggers for convenience
export const { websocket, session, api } = logger;