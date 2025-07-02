const Joi = require('joi');
const { config } = require('../config');
const { logSecurityEvent } = require('../utils/logger');

// URL validation schema
const urlSchema = Joi.string()
  .uri({ scheme: ['http', 'https'] })
  .max(2048)
  .required()
  .custom((value, helpers) => {
    // Block internal/localhost URLs in production
    if (config.nodeEnv === 'production') {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      
      // Block localhost, internal IPs, and private networks
      const blockedPatterns = [
        /^localhost$/,
        /^127\./,
        /^192\.168\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^169\.254\./,
        /^::1$/,
        /^fc00:/,
        /^fe80:/
      ];
      
      if (blockedPatterns.some(pattern => pattern.test(hostname))) {
        throw new Error('Internal/localhost URLs are not allowed');
      }
    }
    
    return value;
  });

// Asset types enum
const assetTypes = [
  '3d-model', 'environment-map', 'texture', 'video', 'audio', 
  'image', 'javascript', 'stylesheet', 'html', 'font', 'other'
];

// Export formats enum
const exportFormats = ['zip', 'github', 'vscode', 'docker', 'netlify'];

// Cloning options schema
const cloningOptionsSchema = Joi.object({
  depth: Joi.number().integer().min(1).max(config.crawling.maxDepth).default(config.crawling.defaultDepth),
  includeAssets: Joi.array().items(Joi.string().valid(...assetTypes)).default(assetTypes),
  optimizeImages: Joi.boolean().default(true),
  generateServiceWorker: Joi.boolean().default(true),
  exportFormat: Joi.array().items(Joi.string().valid(...exportFormats)).min(1).default(['zip'])
});

// Clone request validation
const validateCloneRequest = (req, res, next) => {
  const schema = Joi.object({
    url: urlSchema,
    options: cloningOptionsSchema.default({})
  });

  const { error, value } = schema.validate(req.body, { allowUnknown: false });
  
  if (error) {
    logSecurityEvent('VALIDATION_ERROR', {
      ip: req.ip,
      error: error.details[0].message,
      path: error.details[0].path,
      url: req.url,
      body: req.body
    });
    
    return res.status(400).json({ 
      error: 'Invalid request data',
      details: error.details[0].message,
      field: error.details[0].path.join('.')
    });
  }
  
  // Replace request body with validated/sanitized data
  req.body = value;
  next();
};

// Session ID validation middleware
const validateSessionId = (req, res, next) => {
  const sessionId = req.params.sessionId || req.body.sessionId;
  
  const schema = Joi.string()
    .uuid()
    .required();
  
  const { error } = schema.validate(sessionId);
  
  if (error) {
    logSecurityEvent('INVALID_SESSION_ID', {
      ip: req.ip,
      sessionId,
      error: error.details[0].message,
      url: req.url
    });
    
    return res.status(400).json({ 
      error: 'Invalid session ID',
      details: 'Session ID must be a valid UUID v4'
    });
  }
  
  next();
};

// WebSocket message validation
const validateWebSocketMessage = (message) => {
  const schema = Joi.object({
    type: Joi.string().valid(
      'recover_session', 'resume_session', 'pause_session', 'cancel_session'
    ).required(),
    sessionId: Joi.string().uuid(),
    data: Joi.object().unknown(true)
  });
  
  const { error, value } = schema.validate(message);
  
  if (error) {
    throw new Error(`Invalid WebSocket message: ${error.details[0].message}`);
  }
  
  return value;
};

// File upload validation
const validateFileUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const allowedMimeTypes = [
    'application/json',
    'text/plain',
    'application/zip'
  ];
  
  const maxFileSize = 10 * 1024 * 1024; // 10MB
  
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    logSecurityEvent('INVALID_FILE_TYPE', {
      ip: req.ip,
      mimetype: req.file.mimetype,
      filename: req.file.originalname
    });
    
    return res.status(400).json({ 
      error: 'Invalid file type',
      allowedTypes: allowedMimeTypes
    });
  }
  
  if (req.file.size > maxFileSize) {
    logSecurityEvent('FILE_TOO_LARGE', {
      ip: req.ip,
      fileSize: req.file.size,
      maxSize: maxFileSize,
      filename: req.file.originalname
    });
    
    return res.status(400).json({ 
      error: 'File too large',
      maxSize: `${maxFileSize / 1024 / 1024}MB`
    });
  }
  
  next();
};

// Generic validation middleware factory
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property]);
    
    if (error) {
      logSecurityEvent('VALIDATION_ERROR', {
        ip: req.ip,
        property,
        error: error.details[0].message,
        url: req.url
      });
      
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message,
        field: error.details[0].path.join('.')
      });
    }
    
    req[property] = value;
    next();
  };
};

// URL sanitization helper
const sanitizeUrl = (url) => {
  try {
    const parsed = new URL(url);
    
    // Remove sensitive query parameters
    const sensitiveParams = ['token', 'key', 'secret', 'password', 'auth'];
    sensitiveParams.forEach(param => {
      parsed.searchParams.delete(param);
    });
    
    // Normalize the URL
    return parsed.toString();
  } catch (error) {
    throw new Error('Invalid URL format');
  }
};

module.exports = {
  validateCloneRequest,
  validateSessionId,
  validateWebSocketMessage,
  validateFileUpload,
  validate,
  sanitizeUrl,
  // Export schemas for reuse
  schemas: {
    url: urlSchema,
    cloningOptions: cloningOptionsSchema
  }
};