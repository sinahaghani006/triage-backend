const bcrypt = require('bcrypt');
const prisma = require('../config/prismaClient');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/auditLogService');
const { getRecentHistorySummary } = require('../services/patientHistoryService');

const SALT_ROUNDS = 12;

// 2026-07-28: age is stored as an approximate birthDate (derived from the
// age the user submitted -- see sessionsController.js upsert fix) purely
// to satisfy the NOT NULL column; this recomputes a year-accurate age back
// from it for Frontend's "returning user, skip the form" flow.
function calculateAgeFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const bd = new Date(birthDate);
  let age = today.getFullYear() - bd.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > bd.getMonth() ||
    (today.getMonth() === bd.getMonth() && today.getDate() >= bd.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

async function getHistorySummary(req, res, next) {
  try {
    const limit = Number(req.query.limit) || 5;
    const history = await getRecentHistorySummary(req.user.id, limit);

    const patientRecord = await prisma.patientDetails.findUnique({
      where: { userId: req.user.id },
    });

    // 2026-07-30: CEO request -- Frontend needs to display the user's name
    // in two UI spots (identity-confirmation gate + triage header) but has
    // no way to read it (httpOnly session cookie, name only returned once
    // at register/login). Reusing this endpoint per Frontend's own suggestion
    // rather than adding a new one.
    return res.status(200).json({
      name: req.user.name,
      history,
      lastAge: patientRecord ? calculateAgeFromBirthDate(patientRecord.birthDate) : null,
      lastWeightKg: patientRecord?.weightKg ?? null,
      lastHeightCm: patientRecord?.heightCm ?? null,
      lastGender: patientRecord?.gender ?? null,
    });
  } catch (err) {
    return next(err);
  }
}

const MEDICAL_HISTORY_DEFAULTS = {
  chronicConditions: [],
  allergies: [],
  currentMedications: [],
  surgicalHistory: [],
  familyHistory: [],
};

// GET /users/me/medical-history
async function getMedicalHistory(req, res, next) {
  try {
    const record = await prisma.medicalHistory.findUnique({ where: { userId: req.user.id } });
    return res.status(200).json({ medicalHistory: record || MEDICAL_HISTORY_DEFAULTS });
  } catch (err) {
    return next(err);
  }
}

// PUT /users/me/medical-history Ã¢â‚¬â€ full or partial update (project manager
// decision, 2026-07-19); all fields optional, never required for triage.
async function updateMedicalHistory(req, res, next) {
  try {
    const { chronicConditions, allergies, currentMedications, surgicalHistory, familyHistory } = req.body;
    const data = {};
    if (chronicConditions !== undefined) data.chronicConditions = chronicConditions;
    if (allergies !== undefined) data.allergies = allergies;
    if (currentMedications !== undefined) data.currentMedications = currentMedications;
    if (surgicalHistory !== undefined) data.surgicalHistory = surgicalHistory;
    if (familyHistory !== undefined) data.familyHistory = familyHistory;

    const record = await prisma.medicalHistory.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, ...MEDICAL_HISTORY_DEFAULTS, ...data },
      update: data,
    });

    return res.status(200).json({ medicalHistory: record });
  } catch (err) {
    return next(err);
  }
}

// POST /users/me/vitals Ã¢â‚¬â€ records one periodic vitals reading.
async function createVital(req, res, next) {
  try {
    const { type, value, recordedAt } = req.body;
    const vital = await prisma.periodicVitals.create({
      data: {
        userId: req.user.id,
        type,
        value,
        ...(recordedAt ? { recordedAt: new Date(recordedAt) } : {}),
      },
    });
    return res.status(201).json({ vital });
  } catch (err) {
    return next(err);
  }
}

// GET /users/me/vitals Ã¢â‚¬â€ history, optionally filtered by ?type=
async function listVitals(req, res, next) {
  try {
    const { type } = req.query;
    const limit = Number(req.query.limit) || 20;
    const vitals = await prisma.periodicVitals.findMany({
      where: { userId: req.user.id, ...(type ? { type } : {}) },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
    return res.status(200).json({ vitals });
  } catch (err) {
    return next(err);
  }
}


// PATCH /users/me/patient-details
// Step 2 of registration (2026-07-22): Frontend calls this immediately
// after /auth/register succeeds. Upsert-based so it also works for later updates.
async function upsertPatientDetails(req, res, next) {
  try {
    const { birthDate, weightKg, heightCm, gender } = req.body;
    const data = { birthDate: new Date(birthDate) };
    if (weightKg !== undefined) data.weightKg = weightKg;
    if (heightCm !== undefined) data.heightCm = heightCm;
    if (gender !== undefined) data.gender = gender;

    const record = await prisma.patientDetails.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, ...data },
      update: data,
    });

    return res.status(200).json({ patientDetails: record });
  } catch (err) {
    return next(err);
  }
}

// GET /users/me/wallet
async function getWalletInfo(req, res, next) {
  try {
    const { getWallet } = require('../services/walletService');
    const wallet = await getWallet(req.user.id);
    return res.status(200).json({ wallet });
  } catch (err) {
    return next(err);
  }
}
// PATCH /users/me/password
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatches) {
      recordAudit({
        userId: user.id,
        action: 'password_change_failed',
        entityType: 'User',
        entityId: user.id,
        metadata: { reason: 'wrong_current_password' },
      });
      throw new AppError('Current password is incorrect', 401, 'INVALID_CREDENTIALS');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: newPasswordHash },
    });

    recordAudit({ userId: user.id, action: 'password_changed', entityType: 'User', entityId: user.id });
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getWalletInfo,
  upsertPatientDetails,
  getHistorySummary,
  getMedicalHistory,
  updateMedicalHistory,
  createVital,
  listVitals,
  changePassword,
};
