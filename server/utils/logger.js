const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for production logs
const productionFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Custom format for development logs
const developmentFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { service: 'procloner' },
  transports: [
    // Error logs
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Combined logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: developmentFormat
  }));
}

// Create session-specific logger
const createSessionLogger = (sessionId) => {
  return logger.child({ sessionId });
};

// Helper methods for common logging patterns
const logCrawlStart = (sessionId, url, options) => {
  logger.info('Crawl session started', {
    sessionId,
    url,
    options,
    timestamp: new Date().toISOString()
  });
};

const logCrawlComplete = (sessionId, result) => {
  logger.info('Crawl session completed', {
    sessionId,
    assetsFound: result.assetsFound,
    pagesVisited: result.pagesVisited,
    duration: result.duration,
    timestamp: new Date().toISOString()
  });
};

const logCrawlError = (sessionId, error, context = {}) => {
  logger.error('Crawl session failed', {
    sessionId,
    error: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
};

const logAssetFound = (sessionId, asset) => {
  logger.debug('Asset discovered', {
    sessionId,
    assetType: asset.type,
    assetUrl: asset.url,
    assetSize: asset.size,
    timestamp: new Date().toISOString()
  });
};

const logSessionRecovery = (sessionId, canRecover) => {
  logger.info('Session recovery attempted', {
    sessionId,
    canRecover,
    timestamp: new Date().toISOString()
  });
};

const logSecurityEvent = (type, details) => {
  logger.warn('Security event', {
    type,
    details,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  logger,
  createSessionLogger,
  logCrawlStart,
  logCrawlComplete,
  logCrawlError,
  logAssetFound,
  logSessionRecovery,
  logSecurityEvent
};