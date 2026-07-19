const prisma = require('../config/prismaClient');
const AppError = require('../utils/AppError');
const { canTransition, resolveStateForUrgency, AUTO_FINALIZE_STATES } = require('../utils/sessionStateMachine');
const { runAiTriageAnalysis } = require('../services/aiTriageGateway');
const { recordAudit } = require('../services/auditLogService');
const calculateAge = require('../utils/calculateAge');
const { generateQuestions } = require('../services/aiTriageGateway');
const { recordHistorySummary, getRecentHistorySummary } = require('../services/patientHistoryService');
function toPublicSession(session) {
  return {
    id: session.id,
    userId: session.userId,
    currentState: session.currentState,
    state: session.currentState,
    presentingProblemId: session.presentingProblemId,
    urgencyLevel: session.triageResult?.urgencyLevel ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    closedAt: session.closedAt,
    cancelledAt: session.cancelledAt,
    ...(session.triageResult
      ? {
          triageResult: {
            urgencyLevel: session.triageResult.urgencyLevel,
            triageResultJson: session.triageResult.triageResultJson,
          },
        }
      : {}),
  };
}

async function loadOwnedSessionOr404(sessionId, userId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { triageResult: true },
  });
  if (!session || session.userId !== userId) {
    // Same error for "not found" and "not yours" — don't leak existence of
    // other users' sessions.
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }
  return session;
}

// POST /sessions
// Implements: S1 initial_state --(create_session)--> S2 collecting_information.
// S1 is never persisted (see sessionStateMachine.js) — the row is created
// directly in S2.
async function createSession(req, res, next) {
  try {
    const session = await prisma.session.create({
      data: { userId: req.user.id },
    });
    recordAudit({
      userId: req.user.id,
      action: 'session_created',
      entityType: 'Session',
      entityId: session.id,
    });
    return res.status(201).json({ session: toPublicSession(session) });
  } catch (err) {
    return next(err);
  }
}
// POST /sessions/:id/generate-questions
// Stays in S2_collecting_information — does not transition state, just
// returns AI-generated follow-up questions for the Frontend to ask before
// calling submit-symptoms with the answers.
async function generateSessionQuestions(req, res, next) {
  const sessionId = req.params.id;
  try {
    const session = await loadOwnedSessionOr404(sessionId, req.user.id);

    if (session.currentState !== 'S2_collecting_information') {
      throw new AppError(
        `Cannot generate questions from state ${session.currentState}`,
        409,
        'INVALID_STATE_TRANSITION',
      );
    }

    const { presentingProblemId, patientDetails } = req.body;

    const patientRecord = await prisma.patientDetails.findUnique({
      where: { userId: req.user.id },
    });
    if (!patientRecord) {
      throw new AppError(
        'No birth date on file for this user; cannot compute age',
        422,
        'PATIENT_DETAILS_MISSING',
      );
    }
    const age = calculateAge(patientRecord.birthDate);
    const patientHistory = await getRecentHistorySummary(req.user.id, 5);

    const result = await generateQuestions({ presentingProblemId, age, patientDetails, patientHistory });

    return res.status(200).json({ questions: result.questions });
  } catch (err) {
    return next(err);
  }
}
// GET /sessions/:id
async function getSession(req, res, next) {
  try {
    const session = await loadOwnedSessionOr404(req.params.id, req.user.id);
    return res.status(200).json({ session: toPublicSession(session) });
  } catch (err) {
    return next(err);
  }
}

// GET /sessions
async function listSessions(req, res, next) {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user.id },
      include: { triageResult: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ sessions: sessions.map(toPublicSession) });
  } catch (err) {
    return next(err);
  }
}

// POST /sessions/:id/submit-symptoms
// Implements: S2 --(submit_symptoms)--> S4 AI_triage_processing
//             --(run_ai_analyzer)--> S3 assign_urgency
//             --(assign_urgency_level)--> one of S5/S6/S7/S8
// S3 is never persisted as its own row state (transient), same treatment as S1.
async function submitSymptoms(req, res, next) {
  const sessionId = req.params.id;
  try {
    const session = await loadOwnedSessionOr404(sessionId, req.user.id);

    if (!canTransition('submit_symptoms', session.currentState)) {
      throw new AppError(
        `Cannot submit symptoms from state ${session.currentState}`,
        409,
        'INVALID_STATE_TRANSITION',
      );
    }

    const { presentingProblemId, patientDetails, answers } = req.body;

    const patientRecord = await prisma.patientDetails.findUnique({
      where: { userId: req.user.id },
    });
    if (!patientRecord) {
      // Should not happen for users registered after birthDate became
      // required, but fail clearly rather than silently sending age=undefined.
      throw new AppError(
        'No birth date on file for this user; cannot compute age for triage',
        422,
        'PATIENT_DETAILS_MISSING',
      );
    }
    const age = calculateAge(patientRecord.birthDate);

    const submittedWeight = patientDetails?.weightKg ?? patientDetails?.weight;
    const submittedHeight = patientDetails?.heightCm ?? patientDetails?.height;
    const submittedGender = patientDetails?.gender;
    const patientUpdateData = {};
    if (submittedWeight !== undefined && submittedWeight !== null) {
      patientUpdateData.weightKg = submittedWeight;
    }
    if (submittedHeight !== undefined && submittedHeight !== null) {
      patientUpdateData.heightCm = submittedHeight;
    }
    if (submittedGender !== undefined && submittedGender !== null) {
      patientUpdateData.gender = submittedGender;
    }
    if (Object.keys(patientUpdateData).length > 0) {
      await prisma.patientDetails.update({
        where: { userId: req.user.id },
        data: patientUpdateData,
      });
    }

    const patientHistory = await getRecentHistorySummary(req.user.id, 5);

    // Persist the move into S4 before calling the AI module, so the state
    // reflects reality even if the AI call is slow or fails.
    await prisma.session.update({
      where: { id: sessionId },
      data: { currentState: 'S4_ai_triage_processing', presentingProblemId },
    });

    const { urgencyLevel, triageResultJson } = await runAiTriageAnalysis({
      sessionId,
      patientResponses: {
        presentingProblemId,
        patientDetails: { ...patientDetails, age },
        answers,
      },
      patientHistory,
    });

    const resolvedState = resolveStateForUrgency(urgencyLevel);
    if (!resolvedState) {
      throw new AppError(
        `AI module returned an unrecognized urgencyLevel: ${urgencyLevel}`,
        502,
        'AI_RESPONSE_INVALID',
      );
    }

    // Decision (project manager, 2026-07-12): finalize_triage is Role:System
    // in the diagram, so S6/S7/S8 go straight to S9 here — no separate
    // Frontend call. S5 (pending_doctor_review) is the one exception: it
    // stays open until a staff member reviews it (see staffFinalizeReview).
    const isAutoFinalized = AUTO_FINALIZE_STATES.has(resolvedState);
    const finalState = isAutoFinalized ? 'S9_completed_triage' : resolvedState;

    const [, updatedSession] = await prisma.$transaction([
      prisma.triageResult.create({
        data: { sessionId, urgencyLevel, triageResultJson },
      }),
      prisma.session.update({
        where: { id: sessionId },
        data: { currentState: finalState },
        include: { triageResult: true },
      }),
    ]);

    recordAudit({
      userId: req.user.id,
      action: 'session_state_transition',
      entityType: 'Session',
      entityId: sessionId,
      metadata: { from: 'S2_collecting_information', to: finalState, urgencyLevel, autoFinalized: isAutoFinalized },
    });

    if (isAutoFinalized) {
      try {
        await recordHistorySummary({
          userId: req.user.id,
          sessionId,
          presentingProblemId,
          urgencyLevel,
          reasoningSummary: triageResultJson?.reasoning,
        });
      } catch (historyErr) {
        // Best-effort: never let history-summary recording break the main flow.
      }
    }

    return res.status(200).json({ session: toPublicSession(updatedSession) });
  } catch (err) {
    return next(err);
  }
}

// POST /sessions/:id/staff-finalize
// Implements: S5 pending_doctor_review --(finalize_triage)--> S9 completed_triage.
// Staff-only (see requireStaff middleware). Minimal Phase-1 stand-in for a
// real doctor review panel (Phase 2, out of scope for this team) — staff
// accounts are created manually via SQL for now (see README).
// Not ownership-scoped: staff review sessions belonging to any patient.
async function staffFinalizeReview(req, res, next) {
  const sessionId = req.params.id;
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { triageResult: true },
    });
    if (!session) {
      throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    if (!canTransition('finalize_triage', session.currentState)) {
      throw new AppError(
        `Cannot finalize triage from state ${session.currentState}`,
        409,
        'INVALID_STATE_TRANSITION',
      );
    }

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { currentState: 'S9_completed_triage' },
      include: { triageResult: true },
    });

    recordAudit({
      userId: req.user.id,
      action: 'session_reviewed_by_staff',
      entityType: 'Session',
      entityId: sessionId,
      metadata: { from: session.currentState, to: 'S9_completed_triage', reviewedBy: req.user.id },
    });

    try {
      await recordHistorySummary({
        userId: updated.userId,
        sessionId,
        presentingProblemId: updated.presentingProblemId,
        urgencyLevel: updated.triageResult?.urgencyLevel,
        reasoningSummary: updated.triageResult?.triageResultJson?.reasoning,
      });
    } catch (historyErr) {
      // Best-effort: never let history-summary recording break the main flow.
    }

    return res.status(200).json({ session: toPublicSession(updated) });
  } catch (err) {
    return next(err);
  }
}

// POST /sessions/:id/close
// Implements: S9 completed_triage --(close_session)--> END
async function closeSession(req, res, next) {
  const sessionId = req.params.id;
  try {
    const session = await loadOwnedSessionOr404(sessionId, req.user.id);

    if (!canTransition('close_session', session.currentState)) {
      throw new AppError(
        `Cannot close a session from state ${session.currentState}`,
        409,
        'INVALID_STATE_TRANSITION',
      );
    }
    if (session.closedAt) {
      throw new AppError('Session is already closed', 409, 'SESSION_ALREADY_CLOSED');
    }

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { closedAt: new Date() },
      include: { triageResult: true },
    });

    recordAudit({
      userId: req.user.id,
      action: 'session_closed',
      entityType: 'Session',
      entityId: sessionId,
    });

    return res.status(200).json({ session: toPublicSession(updated) });
  } catch (err) {
    return next(err);
  }
}

// POST /sessions/:id/cancel
// Implements: any state --(cancel_session)--> S10 triage_cancelled_by_user --> END
async function cancelSession(req, res, next) {
  const sessionId = req.params.id;
  try {
    const session = await loadOwnedSessionOr404(sessionId, req.user.id);

    if (!canTransition('cancel_session', session.currentState)) {
      throw new AppError(
        `Cannot cancel a session already in a terminal state (${session.currentState})`,
        409,
        'INVALID_STATE_TRANSITION',
      );
    }

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { currentState: 'S10_cancelled_by_user', cancelledAt: new Date() },
      include: { triageResult: true },
    });

    recordAudit({
      userId: req.user.id,
      action: 'session_cancelled',
      entityType: 'Session',
      entityId: sessionId,
      metadata: { from: session.currentState },
    });

    return res.status(200).json({ session: toPublicSession(updated) });
  } catch (err) {
    return next(err);
  }
}
// POST /sessions/:id/feedback
// Only allowed once triage is fully completed (S9). One feedback per
// session — resubmission overwrites via upsert (project manager
// decision, 2026-07-15).
async function submitFeedback(req, res, next) {
  const sessionId = req.params.id;
  try {
    const session = await loadOwnedSessionOr404(sessionId, req.user.id);

    if (session.currentState !== 'S9_completed_triage') {
      throw new AppError(
        'Feedback can only be submitted after triage is completed',
        409,
        'SESSION_NOT_COMPLETED',
      );
    }

    const { rating, comment } = req.body;

    const feedback = await prisma.patientFeedback.upsert({
      where: { sessionId },
      create: { sessionId, rating, comment },
      update: { rating, comment },
    });

    recordAudit({
      userId: req.user.id,
      action: 'session_feedback_submitted',
      entityType: 'Session',
      entityId: sessionId,
      metadata: { rating },
    });

    return res.status(200).json({ feedback });
  } catch (err) {
    return next(err);
  }
}
module.exports = {
  createSession,
  getSession,
  listSessions,
  submitSymptoms,
  staffFinalizeReview,
  closeSession,
  cancelSession,
  submitFeedback,
  generateSessionQuestions,
};
