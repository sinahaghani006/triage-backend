require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.NODE_ENV === 'test' ? 'test-secret' : requireEnv('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  // Needed because httpOnly auth cookies require a specific origin + credentials:true —
  // the wildcard "*" CORS origin (used before cookie auth existed) cannot be combined
  // with cookies. Frontend team confirmed they're pinned to port 3001.
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3001',
};
