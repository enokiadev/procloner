require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['NODE_ENV'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

// Configuration object with defaults and validation
const config = {
  // Application
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT) || parseInt(process.env.API_PORT) || 3002,
  
  // Security
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'default-session-secret-change-in-production',
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 300000,
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    crawlMaxRequests: parseInt(process.env.RATE_LIMIT_CRAWL_MAX_REQUESTS) || 10
  },
  
  // Crawling
  crawling: {
    maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 5,
    defaultTimeout: parseInt(process.env.DEFAULT_CRAWL_TIMEOUT) || 120000,
    sessionTimeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS) || 5 * 60 * 1000, // 5 minutes
    defaultDepth: parseInt(process.env.DEFAULT_CRAWL_DEPTH) || 3,
    maxDepth: parseInt(process.env.MAX_CRAWL_DEPTH) || 5,
    progressUpdateInterval: parseInt(process.env.PROGRESS_UPDATE_INTERVAL) || 3000, // 3 seconds minimum between progress updates
    deduplicateStatusUpdates: process.env.DEDUPLICATE_STATUS_UPDATES !== 'false' // Prevent duplicate status messages
  },
  
  // Browser
  browser: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    timeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000
  },
  
  // File Storage
  storage: {
    tempDir: process.env.TEMP_DIR || './temp',
    maxTempAgeHours: parseInt(process.env.MAX_TEMP_AGE_HOURS) || 24,
    maxTempSizeMB: parseInt(process.env.MAX_TEMP_SIZE_MB) || 1024
  },
  
  // Security Headers
  security: {
    hstsMaxAge: parseInt(process.env.HSTS_MAX_AGE) || 31536000,
    cspReportUri: process.env.CSP_REPORT_URI || '/api/csp-report'
  }
};

// Validation functions
const validateConfig = () => {
  const errors = [];
  
  if (config.port < 1 || config.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }
  
  if (config.crawling.maxConcurrentSessions < 1 || config.crawling.maxConcurrentSessions > 20) {
    errors.push('MAX_CONCURRENT_SESSIONS must be between 1 and 20');
  }
  
  if (config.crawling.maxDepth < 1 || config.crawling.maxDepth > 10) {
    errors.push('MAX_CRAWL_DEPTH must be between 1 and 10');
  }
  
  if (config.nodeEnv === 'production' && config.sessionSecret === 'default-session-secret-change-in-production') {
    errors.push('SESSION_SECRET must be set in production');
  }
  
  if (errors.length > 0) {
    console.error('Configuration validation errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }
};

// Validate configuration on load
validateConfig();

// Helper to check if running in production
const isProduction = () => config.nodeEnv === 'production';
const isDevelopment = () => config.nodeEnv === 'development';

module.exports = {
  config,
  isProduction,
  isDevelopment,
  validateConfig
};