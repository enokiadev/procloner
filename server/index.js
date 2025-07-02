const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");
const http = require("http");
const path = require("path");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid");
const session = require("express-session");
const passport = require("./config/auth");
const { router: authRouter, requireAuth, requireAdmin } = require('./routes/auth');
const Usage = require('./models/Usage');

// Import configuration and middleware
const { config, isProduction } = require('./config');
const { logger, logCrawlStart, logCrawlComplete, logCrawlError, logSessionRecovery } = require('./utils/logger');
const { 
  securityHeaders, 
  generalRateLimit, 
  crawlRateLimit, 
  validateSession,
  handleCSPReport
} = require('./middleware/security');
const { validateCloneRequest, validateSessionId } = require('./middleware/validation');

const SmartCrawler = require("./crawlers/SmartCrawler");
const AssetHunter = require("./crawlers/AssetHunter");
const PackageBuilder = require("./utils/PackageBuilder");
const PayloadAnalyzer = require("./utils/PayloadAnalyzer");
const CompletenessVerifier = require("./utils/CompletenessVerifier");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Security middleware
app.use(securityHeaders());
app.use(generalRateLimit);

// CORS configuration
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// Auth routes
app.use('/auth', authRouter);

// Static files
app.use(express.static("public"));

// CSP violation reporting
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), handleCSPReport);

// Store active crawling sessions
const activeSessions = new Map();
const SESSIONS_FILE = path.join(config.storage.tempDir, 'sessions.json');

// Initialize temp directory
fs.ensureDirSync(config.storage.tempDir);

// Enhanced session state management
class SessionManager {
  constructor() {
    this.sessions = activeSessions;
    this.sessionsFile = SESSIONS_FILE;
  }

  // Load existing sessions on startup with enhanced recovery
  async loadSessions() {
    try {
      if (await fs.pathExists(this.sessionsFile)) {
        const sessionsData = await fs.readJson(this.sessionsFile);
        let recoveredCount = 0;
        let errorCount = 0;

        Object.entries(sessionsData).forEach(([sessionId, sessionData]) => {
          // Convert date strings back to Date objects
          if (sessionData.startTime) {
            sessionData.startTime = new Date(sessionData.startTime);
          }
          if (sessionData.completedAt) {
            sessionData.completedAt = new Date(sessionData.completedAt);
          }

          // Handle session recovery based on status
          if (
            sessionData.status === "completed" ||
            sessionData.status === "error"
          ) {
            // Keep completed/errored sessions for reference
            this.sessions.set(sessionId, sessionData);
          } else {
            // Mark interrupted sessions for potential recovery
            const canRecover = this.canRecoverSession(sessionData);
            sessionData.status = "interrupted";
            sessionData.error = "Session interrupted by server restart";
            sessionData.canRecover = canRecover;
            this.sessions.set(sessionId, sessionData);

            if (canRecover) {
              recoveredCount++;
              logger.info('Session marked for recovery', { sessionId });
            } else {
              errorCount++;
              logger.warn('Session cannot be recovered', { sessionId });
            }
          }
        });

        logger.info('Sessions loaded from storage', { 
          totalSessions: this.sessions.size,
          recoveredCount,
          errorCount
        });

        // Save the updated session statuses
        if (recoveredCount > 0 || errorCount > 0) {
          await this.saveSessions();
          logger.info('Updated session statuses saved to disk');
        }
      }
    } catch (error) {
      logger.error('Error loading sessions', { error: error.message, stack: error.stack });
    }
  }

  // Determine if a session can be recovered
  canRecoverSession(sessionData) {
    try {
      // Check if session was recently active (within last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const sessionTime = new Date(sessionData.startTime);

      // Check if output directory still exists
      const outputDirExists = fs.pathExistsSync(sessionData.outputDir);

      // Check if session was in a recoverable state (including interrupted sessions)
      const recoverableStates = [
        "crawling",
        "processing",
        "starting",
        "interrupted",
      ];
      const isRecoverableState = recoverableStates.includes(sessionData.status);

      const canRecover =
        sessionTime > oneHourAgo && outputDirExists && isRecoverableState;

      logger.debug('Checking session recovery', {
        sessionId: sessionData.id,
        recentEnough: sessionTime > oneHourAgo,
        startTime: sessionTime.toISOString(),
        outputDirExists,
        outputDir: sessionData.outputDir,
        isRecoverableState,
        status: sessionData.status,
        canRecover
      });

      return canRecover;
    } catch (error) {
      logger.error('Error checking session recovery', {
        sessionId: sessionData.id,
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  // Enhanced session saving with state preservation
  async saveSessions() {
    try {
      await fs.ensureDir(path.dirname(this.sessionsFile));
      const sessionsData = Object.fromEntries(this.sessions);
      await fs.writeJson(this.sessionsFile, sessionsData, { spaces: 2 });
    } catch (error) {
      logger.error('Error saving sessions', { error: error.message, stack: error.stack });
    }
  }

  // Save session state during operation
  async saveSessionState(sessionId) {
    try {
      const session = this.sessions.get(sessionId);
      if (session) {
        // Save individual session state file for faster recovery
        const sessionStateFile = path.join(
          session.outputDir,
          "session-state.json"
        );
        await fs.writeJson(
          sessionStateFile,
          {
            ...session,
            lastSaved: new Date(),
          },
          { spaces: 2 }
        );
      }
    } catch (error) {
      logger.error('Error saving session state', {
        sessionId,
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Load session state from individual file
  async loadSessionState(sessionId) {
    try {
      const session = this.sessions.get(sessionId);
      if (session && session.outputDir) {
        const sessionStateFile = path.join(
          session.outputDir,
          "session-state.json"
        );
        if (await fs.pathExists(sessionStateFile)) {
          const savedState = await fs.readJson(sessionStateFile);

          // Preserve important current session properties that shouldn't be overwritten
          const preservedProps = {
            status: session.status,
            error: session.error,
            canRecover: session.canRecover,
          };

          // Merge saved state with current session, but preserve critical properties
          Object.assign(session, savedState, preservedProps);

          logger.debug('Loaded session state', {
            sessionId,
            preservedStatus: session.status
          });
          return true;
        }
      }
    } catch (error) {
      logger.error('Error loading session state', {
        sessionId,
        error: error.message,
        stack: error.stack
      });
    }
    return false;
  }
}

const sessionManager = new SessionManager();

// Initialize sessions on startup
sessionManager.loadSessions();

// WebSocket connection for real-time updates
wss.on("connection", (ws) => {
  const clientId = uuidv4();
  logger.info('WebSocket client connected', { clientId });

  // Send connection status
  ws.send(
    JSON.stringify({
      type: "connection_status",
      status: "connected",
      message: "Connected to ProCloner server",
      timestamp: new Date(),
    })
  );

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);
      logger.debug('WebSocket message received', { 
        clientId,
        messageType: data.type,
        sessionId: data.sessionId
      });

      // Handle session recovery requests
      if (data.type === "recover_session" && data.sessionId) {
        const session = activeSessions.get(data.sessionId);
        if (session) {
          // Try to load detailed session state
          await sessionManager.loadSessionState(data.sessionId);

          logSessionRecovery(data.sessionId, session.canRecover);
          logger.debug('Session recovery details', {
            sessionId: data.sessionId,
            status: session.status,
            canRecover: session.canRecover
          });

          // Determine recovery action based on session status
          if (session.status === "interrupted" && session.canRecover) {
            // Offer session recovery
            ws.send(
              JSON.stringify({
                type: "session_recovery_available",
                sessionId: session.id,
                status: session.status,
                progress: session.progress,
                totalAssets: session.assets.length,
                error: session.error,
                url: session.url,
                startTime: session.startTime,
                message: "Session can be recovered. Would you like to resume?",
              })
            );
          } else {
            // Send current session status
            ws.send(
              JSON.stringify({
                type: "status_update",
                sessionId: session.id,
                status: session.status,
                progress: session.progress,
                totalAssets: session.assets.length,
                error: session.error,
                url: session.url,
                startTime: session.startTime,
                message: `Session recovered: ${session.status}`,
              })
            );
          }
        } else {
          // Session not found, notify client
          ws.send(
            JSON.stringify({
              type: "session_not_found",
              sessionId: data.sessionId,
              message: "Session not found or expired",
            })
          );
        }
      }

      // Handle session resume requests
      if (data.type === "resume_session" && data.sessionId) {
        const session = activeSessions.get(data.sessionId);
        if (session && session.canRecover) {
          logger.info('Session resume requested', { sessionId: data.sessionId });
          session.status = "resuming";
          session.error = null;

          // Save the resumed state
          await sessionManager.saveSessions();
          await sessionManager.saveSessionState(data.sessionId);

          // Restart the crawling process
          crawlWebsite(session);

          ws.send(
            JSON.stringify({
              type: "session_resumed",
              sessionId: session.id,
              message: "Session resumed successfully",
            })
          );
        } else {
          ws.send(
            JSON.stringify({
              type: "session_resume_failed",
              sessionId: data.sessionId,
              message: "Session cannot be resumed",
            })
          );
        }
      }
    } catch (error) {
      logger.error('Invalid WebSocket message', {
        clientId,
        error: error.message,
        rawMessage: message.toString()
      });
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid message format",
        })
      );
    }
  });

  ws.on("close", () => {
    logger.info('WebSocket client disconnected', { clientId });
  });

  ws.on("error", (error) => {
    logger.error('WebSocket error', {
      clientId,
      error: error.message,
      stack: error.stack
    });
  });
});

// Broadcast to all connected clients
function broadcast(data) {
  logger.debug('Broadcasting WebSocket message', {
    messageType: data.type,
    sessionId: data.sessionId,
    clientCount: wss.clients.size
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// API Routes

// Health check
app.get("/api/health", (req, res) => {
  const health = {
    status: "ok",
    message: "ProCloner API is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeSessions: activeSessions.size,
    version: require('../package.json').version
  };
  
  res.json(health);
});

// Analyze website payload before cloning
app.post("/api/analyze", crawlRateLimit, validateCloneRequest, async (req, res) => {
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    logger.info('Starting payload analysis', {
      url,
      options,
      ip: req.ip
    });

    const analyzer = new PayloadAnalyzer(url, options);
    const payloadInfo = await analyzer.analyzePayload();

    logger.info('Payload analysis completed', {
      url,
      totalAssets: payloadInfo.totalAssets,
      estimatedSizeMB: payloadInfo.totalEstimatedSizeMB,
      completenessScore: payloadInfo.completenessScore
    });

    res.json({
      success: true,
      url,
      analysis: payloadInfo,
      message: "Payload analysis completed successfully"
    });
  } catch (error) {
    logger.error('Payload analysis failed', {
      error: error.message,
      stack: error.stack,
      url: req.body.url,
      ip: req.ip
    });
    res.status(500).json({ 
      error: "Failed to analyze website payload",
      details: error.message
    });
  }
});

// Start cloning process
app.post("/api/clone", requireAuth, crawlRateLimit, validateCloneRequest, async (req, res) => {
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const sessionId = uuidv4();
    const outputDir = path.join(__dirname, "../temp", sessionId);

    // Ensure output directory exists
    await fs.ensureDir(outputDir);

    // Track usage
    Usage.trackSession(sessionId, req.user.id, url);

    // Create crawling session
    const session = {
      id: sessionId,
      url,
      options,
      status: "starting",
      progress: 0,
      outputDir,
      startTime: new Date(),
      assets: [],
      payloadAnalysis: null,
      completenessReport: null,
      userId: req.user.id,
    };

    activeSessions.set(sessionId, session);

    // Save sessions to persistence
    await sessionManager.saveSessions();

    // Start crawling process
    crawlWebsite(session);
    
    logCrawlStart(sessionId, url, options);

    res.json({
      sessionId,
      status: "started",
      message: "Cloning process initiated",
    });
  } catch (error) {
    logger.error('Clone request failed', {
      error: error.message,
      stack: error.stack,
      url: req.body.url,
      ip: req.ip
    });
    res.status(500).json({ error: "Failed to start cloning process" });
  }
});

// Get session status
app.get("/api/session/:sessionId", validateSessionId, (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.json({
    id: session.id,
    url: session.url,
    status: session.status,
    progress: session.progress,
    assets: session.assets.length,
    startTime: session.startTime,
    error: session.error,
  });
});

// Admin routes
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const stats = Usage.getStats();
  res.json({
    success: true,
    stats,
    serverUptime: process.uptime(),
    activeSessions: activeSessions.size
  });
});

app.get('/api/admin/sessions', requireAdmin, (req, res) => {
  const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
    id,
    url: session.url,
    status: session.status,
    progress: session.progress,
    startTime: session.startTime,
    userId: session.userId,
    assets: session.assets?.length || 0
  }));
  res.json({ sessions });
});

app.get('/api/admin/users/:userId/sessions', requireAdmin, (req, res) => {
  const { userId } = req.params;
  const userSessions = Usage.getUserSessions(userId);
  res.json({ sessions: userSessions });
});

// Download cloned website
app.get("/api/download/:sessionId", requireAuth, validateSessionId, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.status !== "completed") {
      return res.status(400).json({ error: "Cloning not completed yet" });
    }

    // Check if user owns this session or is admin
    if (session.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    const packageBuilder = new PackageBuilder(session.outputDir);
    const zipPath = await packageBuilder.createZip();

    res.download(zipPath, `${session.url.replace(/[^a-zA-Z0-9]/g, "_")}.zip`);
  } catch (error) {
    logger.error('Download failed', {
      sessionId: req.params.sessionId,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: "Failed to create download package" });
  }
});

// Main crawling function
async function crawlWebsite(session) {
  // Set up session timeout
  const sessionTimeout = setTimeout(async () => {
    logger.warn('Session timeout reached', {
      sessionId: session.id,
      timeoutMinutes: 5,
      assetsFound: session.assets.length
    });
    session.status = "timeout";
    session.error = "Session timed out after 5 minutes";
    await sessionManager.saveSessions(); // Save timeout status
    broadcast({
      type: "status_update",
      sessionId: session.id,
      status: session.status,
      error: session.error,
      totalAssets: session.assets.length,
      message: "Cloning timed out after 5 minutes",
    });
  }, config.crawling.sessionTimeoutMs); // Use configurable timeout

  try {
    // Phase 1: Payload Analysis
    session.status = "analyzing";
    await sessionManager.saveSessions(); // Save status change
    await sessionManager.saveSessionState(session.id); // Save detailed state
    broadcast({
      type: "status_update",
      sessionId: session.id,
      status: session.status,
      totalAssets: session.assets.length,
      message: "Analyzing website payload and determining complete size...",
    });

    logger.info('Starting payload analysis for cloning session', {
      sessionId: session.id,
      url: session.url
    });

    const analyzer = new PayloadAnalyzer(session.url, session.options);
    session.payloadAnalysis = await analyzer.analyzePayload();

    broadcast({
      type: "payload_analysis_complete",
      sessionId: session.id,
      analysis: {
        totalAssets: session.payloadAnalysis.totalAssets,
        estimatedSizeMB: session.payloadAnalysis.totalEstimatedSizeMB,
        completenessScore: session.payloadAnalysis.completenessScore,
        criticalAssets: session.payloadAnalysis.criticalAssets,
        estimatedDownloadTime: session.payloadAnalysis.estimatedDownloadTime
      },
      message: `Payload analysis complete: ${session.payloadAnalysis.totalAssets} assets, ${session.payloadAnalysis.totalEstimatedSizeMB}MB estimated`,
    });

    logger.info('Payload analysis completed for session', {
      sessionId: session.id,
      totalAssets: session.payloadAnalysis.totalAssets,
      estimatedSizeMB: session.payloadAnalysis.totalEstimatedSizeMB,
      completenessScore: session.payloadAnalysis.completenessScore
    });

    // Phase 2: Start Crawling with known payload information
    session.status = "crawling";
    await sessionManager.saveSessions(); // Save status change
    await sessionManager.saveSessionState(session.id); // Save detailed state
    broadcast({
      type: "status_update",
      sessionId: session.id,
      status: session.status,
      totalAssets: session.assets.length,
      expectedAssets: session.payloadAnalysis.totalAssets,
      message: "Starting website crawling with complete payload knowledge...",
    });

    // Initialize crawlers
    const smartCrawler = new SmartCrawler({
      outputDir: session.outputDir,
      timeout: 120000, // 2 minute timeout
      onProgress: async (progress) => {
        session.progress = progress;

        // Save state periodically during crawling
        if (Math.floor(progress) % 10 === 0) {
          // Save every 10% progress
          await sessionManager.saveSessionState(session.id);
        }

        broadcast({
          type: "progress_update",
          sessionId: session.id,
          progress: progress,
          totalAssets: session.assets.length,
          message: `Crawling progress: ${Math.round(progress)}% (${
            session.assets.length
          } assets found)`,
        });
      },
      onAssetFound: async (asset) => {
        session.assets.push(asset);

        // Save state every 5 assets found
        if (session.assets.length % 5 === 0) {
          await sessionManager.saveSessionState(session.id);
        }

        const fileName = asset.url.split("/").pop() || "unknown";
        broadcast({
          type: "asset_found",
          sessionId: session.id,
          asset: asset,
          totalAssets: session.assets.length,
          message: `Found ${asset.type}: ${fileName}`,
        });
      },
    });

    // Start crawling
    logger.info('Starting website crawl', {
      sessionId: session.id,
      url: session.url,
      options: session.options
    });
    const result = await smartCrawler.crawl(session.url, session.options);

    if (!result || !result.success) {
      throw new Error(`Crawling failed: ${result?.error || "Unknown error"}`);
    }

    logger.info('Website crawl completed', {
      sessionId: session.id,
      assetsFound: result.assetsFound,
      pagesVisited: result.pagesVisited,
      success: true
    });

    // Phase 3: Completeness Verification
    session.status = "verifying";
    await sessionManager.saveSessions(); // Save status change
    await sessionManager.saveSessionState(session.id); // Save detailed state
    broadcast({
      type: "status_update",
      sessionId: session.id,
      status: session.status,
      totalAssets: session.assets.length,
      expectedAssets: session.payloadAnalysis.totalAssets,
      message: "Verifying completeness and checking for missed assets...",
    });

    logger.info('Starting completeness verification', {
      sessionId: session.id,
      expectedAssets: session.payloadAnalysis.totalAssets,
      actualAssets: session.assets.length
    });

    // Create asset map for verification
    const discoveredAssets = new Map();
    session.assets.forEach(asset => {
      discoveredAssets.set(asset.url, asset);
    });

    // Convert payload analysis assets to expected format
    const expectedAssets = new Map();
    session.payloadAnalysis.assetManifest.forEach(asset => {
      expectedAssets.set(asset.url, asset);
    });

    const verifier = new CompletenessVerifier(session.outputDir, expectedAssets);
    session.completenessReport = await verifier.verifyCompleteness(discoveredAssets);

    broadcast({
      type: "completeness_verification_complete",
      sessionId: session.id,
      completeness: {
        percentage: session.completenessReport.completenessPercentage,
        missingAssets: session.completenessReport.totalMissing,
        failedAssets: session.completenessReport.totalFailed,
        qualityScore: session.completenessReport.qualityScore,
        criticalAssetsMissing: session.completenessReport.criticalAssetsMissing
      },
      message: `Completeness verification: ${session.completenessReport.completenessPercentage}% complete`,
    });

    logger.info('Completeness verification completed', {
      sessionId: session.id,
      completenessPercentage: session.completenessReport.completenessPercentage,
      missingAssets: session.completenessReport.totalMissing,
      qualityScore: session.completenessReport.qualityScore
    });

    // Phase 4: Asset Processing
    session.status = "processing";
    await sessionManager.saveSessions(); // Save status change
    await sessionManager.saveSessionState(session.id); // Save detailed state
    broadcast({
      type: "status_update",
      sessionId: session.id,
      status: session.status,
      totalAssets: session.assets.length,
      expectedAssets: session.payloadAnalysis.totalAssets,
      completeness: session.completenessReport.completenessPercentage,
      message: `Processing ${session.assets.length} assets and building package...`,
    });

    // Process and optimize assets
    logger.info('Starting asset processing', {
      sessionId: session.id,
      totalAssets: session.assets.length
    });
    const assetHunter = new AssetHunter(session.outputDir);
    await assetHunter.processAssets(session.assets);

    // Create path mapping symlinks to fix image loading issues
    logger.info('Creating path mapping symlinks', {
      sessionId: session.id
    });
    const packageBuilder = new PackageBuilder(session.outputDir);
    const symlinksCreated = await packageBuilder.createPathMappingSymlinks();
    
    broadcast({
      type: "symlinks_created",
      sessionId: session.id,
      symlinksCreated: symlinksCreated,
      message: `Created ${symlinksCreated} path mapping symlinks to fix asset loading`,
    });

    session.status = "completed";
    session.progress = 100;
    session.completedAt = new Date();
    
    // Calculate final stats
    const totalSize = session.assets.reduce((sum, asset) => sum + (asset.size || 0), 0);
    const totalSizeGB = totalSize / (1024 * 1024 * 1024);
    
    // Update usage tracking
    Usage.completeSession(session.id, totalSizeGB, session.assets.length);
    
    await sessionManager.saveSessions(); // Save completion status
    await sessionManager.saveSessionState(session.id); // Save final state

    const duration = session.completedAt
      ? ((session.completedAt - session.startTime) / 1000).toFixed(1)
      : "unknown";

    logCrawlComplete(session.id, session.assets.length, duration);

    broadcast({
      type: "status_update",
      sessionId: session.id,
      status: session.status,
      progress: 100,
      totalAssets: session.assets.length,
      expectedAssets: session.payloadAnalysis.totalAssets,
      completeness: session.completenessReport.completenessPercentage,
      qualityScore: session.completenessReport.qualityScore,
      duration: duration,
      payloadSummary: {
        estimatedSizeMB: session.payloadAnalysis.totalEstimatedSizeMB,
        completenessPercentage: session.completenessReport.completenessPercentage,
        qualityScore: session.completenessReport.qualityScore,
        missingAssets: session.completenessReport.totalMissing,
        criticalAssetsMissing: session.completenessReport.criticalAssetsMissing
      },
      message: `🎉 Cloning completed! ${session.completenessReport.completenessPercentage}% complete (${session.assets.length}/${session.payloadAnalysis.totalAssets} assets). Quality Score: ${session.completenessReport.qualityScore}%. Found ${
        session.assets.filter((a) => a.type === "3d-model").length
      } 3D models, ${
        session.assets.filter((a) => a.type === "texture").length
      } textures, and ${
        session.assets.filter((a) => a.type === "image").length
      } images. (${duration}s)`,
    });

    // Clear timeout on successful completion
    clearTimeout(sessionTimeout);
  } catch (error) {
    logCrawlError(session.id, error.message, session.assets.length);
    session.status = "error";
    session.error = error.message;
    await sessionManager.saveSessions(); // Save error status
    await sessionManager.saveSessionState(session.id); // Save error state

    // Clear timeout on error
    clearTimeout(sessionTimeout);

    broadcast({
      type: "status_update",
      sessionId: session.id,
      status: session.status,
      error: error.message,
      totalAssets: session.assets.length,
      message: `Cloning failed: ${error.message}`,
    });
  }
}

const PORT = config.port;

server.listen(PORT, () => {
  logger.info('ProCloner server started', {
    port: PORT,
    nodeEnv: config.nodeEnv,
    corsOrigin: config.corsOrigin,
    version: require('../package.json').version
  });
});
