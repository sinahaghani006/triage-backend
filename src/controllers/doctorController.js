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

const { generateDoctorAssistPrompt } = require("../ai/doctorPromptGenerator");
const { callAIProvider } = require("../ai/aiConnector");
const { resolveProviderFn } = require("../services/aiTriageGateway");

// POST /doctor/patients/:id/ai-assistant
// Builds a decision-support prompt from the patient's CURRENT triage
// session (most recent Session with a TriageResult), sends it to the AI
// layer via generateDoctorAssistPrompt (sanitizes free-text PII), and
// returns the 3-part structured suggestion for doctor review.
// ASSUMPTION (flagged for PM): raw otherSymptomsText is not persisted
// anywhere independently yet (same gap as the open initialDescription
// investigation) -- passed as undefined until that's resolved.
async function getAiAssistant(req, res, next) {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!user || user.role !== "patient") {
      throw new AppError("Patient not found", 404, "PATIENT_NOT_FOUND");
    }

    const latestSession = await prisma.session.findFirst({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      include: { triageResult: true },
    });

    if (!latestSession || !latestSession.triageResult) {
      throw new AppError(
        "No completed triage session found for this patient yet",
        404,
        "NO_TRIAGE_SESSION"
      );
    }

    const patientDetails = await prisma.patientDetails.findUnique({ where: { userId: id } });
    const medicalHistory = await prisma.medicalHistory.findUnique({ where: { userId: id } });

    const triageJson = latestSession.triageResult.triageResultJson || {};
    const questionsAsked = triageJson.questions_asked || [];
    const patientResponses = triageJson.patient_responses || [];

    const prompt = generateDoctorAssistPrompt({
      patientAnonymizedId: `بیمار #${id.slice(0, 8)}`,
      age: patientDetails?.age ?? 0,
      sex: patientDetails?.gender === "female" ? "female" : "male",
      weightKg: patientDetails?.weightKg,
      heightCm: patientDetails?.heightCm,
      presentingProblemId: latestSession.presentingProblemId,
      otherSymptomsText: undefined,
      questionsAsked,
      patientResponses,
      medicalHistory: medicalHistory || undefined,
    });

    const providerFn = resolveProviderFn("doctor_assist");
    const { rawText } = await callAIProvider(prompt, providerFn);

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      throw new AppError("AI response was not valid JSON", 502, "AI_RESPONSE_INVALID");
    }

    if (
      typeof parsed.clinical_summary !== "string" ||
      !Array.isArray(parsed.differential_interpretation) ||
      !Array.isArray(parsed.suggested_management) ||
      typeof parsed.urgent_flag !== "boolean"
    ) {
      throw new AppError("AI response did not match the expected 3-part shape", 502, "AI_RESPONSE_INVALID");
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return next(err);
  }
}

module.exports = { listPatients, getPatientDetail, getAiAssistant };