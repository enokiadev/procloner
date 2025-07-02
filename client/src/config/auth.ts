// Enhanced environment detection
const isProd = import.meta.env.PROD;
const isRender = window.location.hostname.includes('onrender.com');
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Determine the correct API URL
const getApiUrl = () => {
  // If we have an explicit API URL set, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Production detection
  if (isProd || isRender) {
    return 'https://procloner.onrender.com';
  }
  
  // Development/localhost
  if (isLocalhost) {
    return 'http://localhost:3002';
  }
  
  // Fallback - try to use current origin if it seems to be the ProCloner app
  const currentOrigin = window.location.origin;
  if (currentOrigin.includes('procloner')) {
    return currentOrigin;
  }
  
  // Ultimate fallback
  return 'http://localhost:3002';
};

const API_URL = getApiUrl();

export const AUTH_CONFIG = {
  apiUrl: API_URL,
  authUrl: `${API_URL}/auth`
};