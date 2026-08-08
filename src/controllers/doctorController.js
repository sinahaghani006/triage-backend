const prisma = require("../config/prismaClient");
const AppError = require("../utils/AppError");
const { getRecentHistorySummary } = require("../services/patientHistoryService");

// GET /doctor/patients
// Minimal Phase-1 listing (2026-08-08). One row per patient user, showing
// their most recent session's status -- not one row per session.
// phoneNumber requested by Frontend but not in schema yet -- omitted until
// PM decides whether to add it.
async function listPatients(req, res, next) {
  try {
    const patients = await prisma.user.findMany({
      where: { role: "patient" },
      select: {
        id: true,
        name: true,
        nationalId: true,
        phoneNumber: true,
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { presentingProblemId: true, doctorReviewStatus: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = patients.map((p) => {
      const latestSession = p.sessions[0] || null;
      return {
        id: p.id,
        name: p.name,
        nationalId: p.nationalId,
        phoneNumber: p.phoneNumber,
        doctorReviewStatus: latestSession?.doctorReviewStatus ?? null,
        presentingProblemId: latestSession?.presentingProblemId ?? null,
      };
    });

    return res.status(200).json({ patients: result });
  } catch (err) {
    return next(err);
  }
}

// GET /doctor/patients/:id
async function getPatientDetail(req, res, next) {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, nationalId: true, phoneNumber: true, email: true, role: true, createdAt: true },
    });
    if (!user || user.role !== "patient") {
      throw new AppError("Patient not found", 404, "PATIENT_NOT_FOUND");
    }
    const [patientDetails, medicalHistory, triageHistory] = await Promise.all([
      prisma.patientDetails.findUnique({ where: { userId: id } }),
      prisma.medicalHistory.findUnique({ where: { userId: id } }),
      getRecentHistorySummary(id, 20),
    ]);

    return res.status(200).json({
      patient: {
        id: user.id,
        name: user.name,
        nationalId: user.nationalId,
        phoneNumber: user.phoneNumber,
        email: user.email,
        birthDate: patientDetails?.birthDate ?? null,
        age: patientDetails?.age ?? null,
        weightKg: patientDetails?.weightKg ?? null,
        heightCm: patientDetails?.heightCm ?? null,
        gender: patientDetails?.gender ?? null,
        medicalHistory: medicalHistory || null,
      },
      triageHistory,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listPatients, getPatientDetail };