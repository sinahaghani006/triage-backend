const prisma = require('../config/prismaClient');
const { getRecentHistorySummary } = require('../services/patientHistoryService');

async function getHistorySummary(req, res, next) {
  try {
    const limit = Number(req.query.limit) || 5;
    const history = await getRecentHistorySummary(req.user.id, limit);

    const patientRecord = await prisma.patientDetails.findUnique({
      where: { userId: req.user.id },
    });

    return res.status(200).json({
      history,
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

// PUT /users/me/medical-history — full or partial update (project manager
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

// POST /users/me/vitals — records one periodic vitals reading.
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

// GET /users/me/vitals — history, optionally filtered by ?type=
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

module.exports = {
  getHistorySummary,
  getMedicalHistory,
  updateMedicalHistory,
  createVital,
  listVitals,
};
