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
  // Zarinpal sandbox (2026-08-01): sandbox.zarinpal.com accepts any
  // UUID-format merchant_id for testing, no real registration needed.
  // Replace ZARINPAL_MERCHANT_ID env var with the real merchant code later
  // -- no other code change required.
  zarinpalMerchantId: process.env.ZARINPAL_MERCHANT_ID || '00000000-0000-0000-0000-000000000000',
  zarinpalCallbackUrl:
    process.env.ZARINPAL_CALLBACK_URL ||
    `${process.env.FRONTEND_ORIGIN || 'http://localhost:3001'}/payment/callback`,
};
