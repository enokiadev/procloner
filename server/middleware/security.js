const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { config } = require('../config');
const { logSecurityEvent } = require('../utils/logger');

// Security headers middleware
const securityHeaders = () => {
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        mediaSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null
      },
      reportUri: config.security.cspReportUri
    },
    
    // HTTP Strict Transport Security
    hsts: {
      maxAge: config.security.hstsMaxAge,
      includeSubDomains: true,
      preload: true
    },
    
    // Other security headers
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  });
};

// General rate limiting
const generalRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      method: req.method
    });
    res.status(options.statusCode).json(options.message);
  }
});

// Strict rate limiting for crawling endpoints
const crawlRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.crawlMaxRequests,
  message: {
    error: 'Too many crawling requests from this IP. Please wait before starting new crawls.',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use combination of IP and user agent for more granular control
    return `${req.ip}-${req.get('User-Agent') || 'unknown'}`;
  },
  handler: (req, res, next, options) => {
    logSecurityEvent('CRAWL_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.body?.sessionId
    });
    res.status(options.statusCode).json(options.message);
  }
});

// Session validation middleware
const validateSession = (req, res, next) => {
  const sessionId = req.params.sessionId || req.body.sessionId;
  
  if (!sessionId) {
    logSecurityEvent('MISSING_SESSION_ID', {
      ip: req.ip,
      url: req.url,
      method: req.method
    });
    return res.status(400).json({ error: 'Session ID is required' });
  }
  
  // Validate session ID format (UUID v4)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sessionId)) {
    logSecurityEvent('INVALID_SESSION_ID_FORMAT', {
      ip: req.ip,
      sessionId,
      url: req.url
    });
    return res.status(400).json({ error: 'Invalid session ID format' });
  }
  
  next();
};

// Request size limiting
const requestSizeLimit = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('content-length') || '0');
    const maxBytes = parseSize(maxSize);
    
    if (contentLength > maxBytes) {
      logSecurityEvent('REQUEST_TOO_LARGE', {
        ip: req.ip,
        contentLength,
        maxAllowed: maxBytes,
        url: req.url
      });
      return res.status(413).json({ 
        error: 'Request too large',
        maxSize: maxSize
      });
    }
    
    next();
  };
};

// Helper function to parse size strings
const parseSize = (size) => {
  const units = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
  const match = size.toLowerCase().match(/^(\d+)(b|kb|mb|gb)$/);
  
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }
  
  return parseInt(match[1]) * units[match[2]];
};

// CORS security check
const secureOriginCheck = (req, res, next) => {
  const origin = req.get('Origin');
  const allowedOrigins = Array.isArray(config.corsOrigin) 
    ? config.corsOrigin 
    : [config.corsOrigin];
  
  if (origin && !allowedOrigins.includes(origin)) {
    logSecurityEvent('UNAUTHORIZED_ORIGIN', {
      ip: req.ip,
      origin,
      allowedOrigins,
      url: req.url
    });
  }
  
  next();
};

// CSP violation reporting endpoint
const handleCSPReport = (req, res) => {
  const report = req.body?.['csp-report'];
  
  if (report) {
    logSecurityEvent('CSP_VIOLATION', {
      blockedUri: report['blocked-uri'],
      documentUri: report['document-uri'],
      violatedDirective: report['violated-directive'],
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
      ip: req.ip
    });
  }
  
  res.status(204).end();
};

module.exports = {
  securityHeaders,
  generalRateLimit,
  crawlRateLimit,
  validateSession,
  requestSizeLimit,
  secureOriginCheck,
  handleCSPReport
};