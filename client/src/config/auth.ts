// Auto-detect production URL or use environment variable
const PROD_URL = import.meta.env.VITE_API_URL || window.location.origin;

export const AUTH_CONFIG = {
  apiUrl: import.meta.env.PROD 
    ? PROD_URL
    : 'http://localhost:3002',
  authUrl: import.meta.env.PROD
    ? `${PROD_URL}/auth`
    : 'http://localhost:3002/auth'
};