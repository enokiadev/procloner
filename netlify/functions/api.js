const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://procloner.netlify.app'
    : 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// In-memory storage for demo (replace with database in production)
const sessions = new Map();
const usage = {
  totalSessions: 0,
  completedSessions: 0,
  activeSessions: 0
};

// Mock auth middleware for Netlify Functions
const requireAuth = (req, res, next) => {
  // In production, you'd validate the session/token here
  // For demo purposes, we'll allow requests
  req.user = { id: 'demo-user', isAdmin: true };
  next();
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ProCloner API is running on Netlify',
    timestamp: new Date().toISOString()
  });
});

// Clone endpoint (simplified for Netlify)
app.post('/api/clone', requireAuth, (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const sessionId = Math.random().toString(36).substring(7);
  
  // Store session
  sessions.set(sessionId, {
    id: sessionId,
    url,
    status: 'completed', // Simplified for demo
    progress: 100,
    startTime: new Date(),
    userId: req.user.id
  });

  usage.totalSessions++;
  usage.completedSessions++;

  res.json({
    sessionId,
    status: 'completed',
    message: 'Demo: Cloning completed instantly'
  });
});

// Session status
app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(session);
});

// Admin stats
app.get('/api/admin/stats', requireAuth, (req, res) => {
  res.json({
    success: true,
    stats: {
      ...usage,
      last7Days: [
        { date: new Date().toISOString().split('T')[0], totalSessions: usage.totalSessions, uniqueUsers: 1 }
      ]
    }
  });
});

// Admin sessions
app.get('/api/admin/sessions', requireAuth, (req, res) => {
  const sessionList = Array.from(sessions.values());
  res.json({ sessions: sessionList });
});

module.exports.handler = serverless(app);