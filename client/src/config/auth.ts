// Auto-detect production URL or use environment variable
const PROD_URL = import.meta.env.VITE_API_URL || window.location.origin;
const isProduction = import.meta.env.PROD || window.location.origin.includes('procloner.onrender.com');

export const AUTH_CONFIG = {
  apiUrl: isProduction 
    ? PROD_URL
    : 'http://localhost:3002',
  authUrl: isProduction
    ? `${PROD_URL}/auth`
    : 'http://localhost:3002/auth'
};