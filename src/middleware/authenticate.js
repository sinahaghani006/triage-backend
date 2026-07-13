const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const { jwtSecret } = require('../config/env');

// Verifies the caller's identity from either the Authorization: Bearer
// header (used by non-browser clients) or the httpOnly "token" cookie set
// by /auth/register (used by the browser Frontend for auto-login).
// Attaches the decoded payload to req.user. Used by Session routes (next task).
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, headerToken] = header.split(' ');
  const token = scheme === 'Bearer' && headerToken ? headerToken : req.cookies?.token;

  if (!token) {
    return next(new AppError('Missing or malformed Authorization header', 401, 'UNAUTHORIZED'));
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = { id: payload.sub, email: payload.email, role: payload.role || 'patient' };
    return next();
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401, 'UNAUTHORIZED'));
  }
}

module.exports = authenticate;
