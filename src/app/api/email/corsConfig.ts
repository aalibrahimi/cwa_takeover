// Centralized CORS origins for all Plaid API routes.
// Update here once — applies everywhere.

export const DEV_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:8000",
  "http://localhost:5173",
  "http://localhost:1420",
  "https://localhost:1420",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:1420",
  "https://127.0.0.1:1420",
  "https://tauri.localhost",
  // "https://simplicitybackend.up.railway.app",
];

export const PROD_CORS_ORIGINS = [
  "https://takeover.codewithali.com",
  // "https://simplicitybackend.up.railway.app",
];