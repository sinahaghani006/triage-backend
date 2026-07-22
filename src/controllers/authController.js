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
    role: user.role,
    createdAt: user.createdAt,
    ...(user.patientDetails
      ? { birthDate: user.patientDetails.birthDate, weightKg: user.patientDetails.weightKg }
      : {}),
  };
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: nodeEnv === 'production' ? 'none' : 'lax',
    maxAge: parseDurationToMs(jwtExpiresIn),
  });
}

// POST /auth/register
// 2026-07-22 change: birthDate/patientDetails are no longer collected here.
// Registration is step 1 of 2 -- Frontend must immediately call
// PATCH /users/me/patient-details right after this succeeds. A Wallet is
// created for every new user with the default starting balance.
async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        wallet: { create: {} },
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
    const { email, password, role } = req.body;

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

    if (role && role !== user.role) {
      recordAudit({
        userId: user.id,
        action: 'login_failed',
        entityType: 'User',
        entityId: user.id,
        metadata: { reason: 'role_mismatch', requestedRole: role, actualRole: user.role },
      });
      throw new AppError('This account does not have the requested role', 403, 'ROLE_MISMATCH');
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
