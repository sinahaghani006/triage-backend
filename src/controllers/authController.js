const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prismaClient');
const AppError = require('../utils/AppError');
const { jwtSecret, jwtExpiresIn, nodeEnv } = require('../config/env');
const parseDurationToMs = require('../utils/parseDurationToMs');
const { recordAudit } = require('../services/auditLogService');

const SALT_ROUNDS = 12;
const AUTH_COOKIE_NAME = 'token';

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret, {
    expiresIn: jwtExpiresIn,
  });
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    ...(user.patientDetails
      ? { birthDate: user.patientDetails.birthDate, weightKg: user.patientDetails.weightKg }
      : {}),
  };
}

// Sets the JWT as an httpOnly cookie so the browser holds the session
// without client-side JS ever touching the token (auto-login on register,
// confirmed by project manager). The token is ALSO still returned in the
// JSON body below for non-browser clients (mobile apps, Postman, etc.) —
// this is additive to the existing contract, nothing is removed from it.
function setAuthCookie(res, token) {
  // *.vercel.app is on the public suffix list, so a Frontend project and
  // this Backend project (two different *.vercel.app subdomains) count as
  // cross-site for cookie purposes, not same-site — despite both being
  // "vercel.app". Cross-site cookies require SameSite=None + Secure.
  // Locally (http://localhost) neither applies, so Lax + non-secure is used.
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: nodeEnv === 'production' ? 'none' : 'lax',
    maxAge: parseDurationToMs(jwtExpiresIn),
  });
}

// POST /auth/register
async function register(req, res, next) {
  try {
    const { name, email, password, birthDate, weight } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // Nested write: User + PatientDetails created atomically in one insert,
    // so age (derived from birthDate) is always available by the time a
    // session reaches submit-symptoms.
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        patientDetails: { create: { birthDate: new Date(birthDate), weightKg: weight } },
      },
      include: { patientDetails: true },
    });

    const token = signToken(user);
    setAuthCookie(res, token);
    recordAudit({ userId: user.id, action: 'user_registered', entityType: 'User', entityId: user.id });
    return res.status(201).json({ user: toPublicUser(user), token });
  } catch (err) {
    return next(err);
  }
}

// POST /auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email }, include: { patientDetails: true } });
    if (!user) {
      recordAudit({ action: 'login_failed', metadata: { email, reason: 'user_not_found' } });
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      recordAudit({
        userId: user.id,
        action: 'login_failed',
        entityType: 'User',
        entityId: user.id,
        metadata: { reason: 'wrong_password' },
      });
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const token = signToken(user);
    setAuthCookie(res, token);
    recordAudit({ userId: user.id, action: 'user_login', entityType: 'User', entityId: user.id });
    return res.status(200).json({ user: toPublicUser(user), token });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login };
