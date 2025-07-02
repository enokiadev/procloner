const express = require('express');
const passport = require('../config/auth');
const router = express.Router();

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
};

const requireAdmin = (req, res, next) => {
  if (req.isAuthenticated() && req.user.isAdmin) {
    return next();
  }
  res.status(403).json({ error: 'Admin access required' });
};

// Google OAuth routes
router.get('/google', (req, res, next) => {
  // Store the referrer or origin in the session for redirect after auth
  const referrer = req.get('Referer') || req.get('Origin');
  if (referrer && !referrer.includes('google.com')) {
    req.session.authRedirect = referrer;
  }
  
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Get the stored redirect URL or default to environment-based URL
    let redirectUrl = req.session.authRedirect;
    
    // Clear the stored redirect
    delete req.session.authRedirect;
    
    // Fallback to environment-based redirect if no stored URL
    if (!redirectUrl) {
      redirectUrl = process.env.NODE_ENV === 'production' 
        ? 'https://procloner.onrender.com/' 
        : 'http://localhost:5173';
    }
    
    // Ensure it's a safe redirect (same origin or known safe domains)
    const allowedOrigins = [
      'https://procloner.onrender.com',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:8080'
    ];
    
    try {
      const redirectOrigin = new URL(redirectUrl).origin;
      if (!allowedOrigins.includes(redirectOrigin)) {
        // If not allowed origin, use default
        redirectUrl = process.env.NODE_ENV === 'production' 
          ? 'https://procloner.onrender.com/' 
          : 'http://localhost:5173';
      }
    } catch (error) {
      // Invalid URL, use default
      redirectUrl = process.env.NODE_ENV === 'production' 
        ? 'https://procloner.onrender.com/' 
        : 'http://localhost:5173';
    }
    
    res.redirect(redirectUrl);
  }
);

// Auth status
router.get('/status', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: req.user
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

module.exports = { router, requireAuth, requireAdmin };