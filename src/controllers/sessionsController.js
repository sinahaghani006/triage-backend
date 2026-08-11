const prisma = require('../config/prismaClient');
const AppError = require('../utils/AppError');
const { canTransition, resolveStateForUrgency, AUTO_FINALIZE_STATES } = require('../utils/sessionStateMachine');
const { runAiTriageAnalysis } = require('../services/aiTriageGateway');
const { recordAudit } = require('../services/auditLogService');
const calculateAge = require('../utils/calculateAge');
const { generateQuestions, generateSecondRoundQuestions } = require('../services/aiTriageGateway');
const { recordHistorySummary, getRecentHistorySummary } = require('../services/patientHistoryService');
const { assertCanStartTriage, deductForCompletedTriage } = require('../services/walletService');
const { creditReferralIfApplicable } = require('../services/referralService');
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
    confirmedSelf: session.confirmedSelf,
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
    // Same error for "not found" and "not yours" ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â don't leak existence of
    // other users' sessions.
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }
  return session;
}

// POST /sessions
// Implements: S1 initial_state --(create_session)--> S2 collecting_information.
// S1 is never persisted (see sessionStateMachine.js) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â the row is created
// directly in S2.
async function createSession(req, res, next) {
  try {
    const { confirmedSelf = true } = req.body;
    const session = await prisma.session.create({
      data: { userId: req.user.id, confirmedSelf },
    });
    recordAudit({
      userId: req.user.id,
      action: 'session_created',
      entityType: 'Session',
      entityId: session.id,
    });
    // Separate audit entry specifically for the self-attestation, so it is
    // independently searchable if a dispute ever arises about who actually
    // requested this triage.
    recordAudit({
      userId: req.user.id,
      action: 'identity_self_confirmed',
      entityType: 'Session',
      entityId: session.id,
      metadata: { confirmedSelf },
    });
    return res.status(201).json({ session: toPublicSession(session) });
  } catch (err) {
    return next(err);
  }
}
// POST /sessions/:id/generate-questions
// Stays in S2_collecting_information ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â does not transition state, just
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

    const { presentingProblemId, patientDetails, initialDescription } = req.body;

    // Diagnostic audit log (added 2026-08-04): records every generate-questions
    // call's presentingProblemId regardless of success/failure, so a future
    // 400/mismatch investigation doesn't hit the same dead end -- this endpoint
    // otherwise writes nothing to the Session row on success OR failure.
    recordAudit({
      userId: req.user.id,
      action: 'generate_questions_requested',
      entityType: 'Session',
      entityId: sessionId,
      metadata: { presentingProblemId, hasBirthDate: !!patientDetails?.birthDate },
    });

    // 2026-08-01 (PM decision, reverting the 2026-07-27 age-direct fix):
    // birthDate is the real source of truth for age again; Frontend sends
    // it fresh in patientDetails (same object as gender/weight/height, not
    // a separate two-step endpoint -- that approach failed before because
    // Frontend never called it). Age is always computed server-side.
    if (!patientDetails?.birthDate) {
      throw new AppError('Patient birthDate is required (patientDetails.birthDate)', 400, 'BIRTHDATE_REQUIRED');
    }
    if (Number.isNaN(new Date(patientDetails.birthDate).getTime())) {
      throw new AppError('Patient birthDate must be a valid date (e.g. 2000-05-15)', 400, 'BIRTHDATE_INVALID_FORMAT');
    }
    const age = calculateAge(patientDetails.birthDate);
    const patientHistory = await getRecentHistorySummary(req.user.id, 5);
    const medicalHistoryRecord = await prisma.medicalHistory.findUnique({ where: { userId: req.user.id } });

    const result = await generateQuestions({ presentingProblemId, initialDescription, age, patientDetails, patientHistory, medicalHistory: medicalHistoryRecord });

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

    // 2026-08-01 (PM decision, reverting the 2026-07-27 age-direct fix):
    // birthDate is the real source of truth again; age is always computed
    // server-side from it, never trusted from the client.
    if (!patientDetails?.birthDate) {
      throw new AppError('Patient birthDate is required (patientDetails.birthDate)', 400, 'BIRTHDATE_REQUIRED');
    }
    if (Number.isNaN(new Date(patientDetails.birthDate).getTime())) {
      throw new AppError('Patient birthDate must be a valid date (e.g. 2000-05-15)', 400, 'BIRTHDATE_INVALID_FORMAT');
    }
    const age = calculateAge(patientDetails.birthDate);

    const submittedWeight = patientDetails?.weightKg ?? patientDetails?.weight;
    const submittedHeight = patientDetails?.heightCm ?? patientDetails?.height;
    const submittedGender = patientDetails?.gender;
    // birthDate is the real source of truth; age is kept in sync as a cache.
    const patientUpdateData = { age, birthDate: new Date(patientDetails.birthDate) };
    if (submittedWeight !== undefined && submittedWeight !== null) {
      patientUpdateData.weightKg = submittedWeight;
    }
    if (submittedHeight !== undefined && submittedHeight !== null) {
      patientUpdateData.heightCm = submittedHeight;
    }
    if (submittedGender !== undefined && submittedGender !== null) {
      patientUpdateData.gender = submittedGender;
    }
    await prisma.patientDetails.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, ...patientUpdateData },
      update: patientUpdateData,
    });

    const patientHistory = await getRecentHistorySummary(req.user.id, 5);
    const medicalHistoryRecord = await prisma.medicalHistory.findUnique({ where: { userId: req.user.id } });
    await assertCanStartTriage(req.user.id);


    // Persist the move into S4 before calling the AI module, so the state
    // reflects reality even if the AI call is slow or fails.
    await prisma.session.update({
      where: { id: sessionId },
      data: { currentState: 'S4_ai_triage_processing', presentingProblemId },
    });

    let urgencyLevel, triageResultJson;
    try {
      ({ urgencyLevel, triageResultJson } = await runAiTriageAnalysis({
        sessionId,
        patientResponses: {
          presentingProblemId,
          patientDetails: { ...patientDetails, age },
          answers,
        },
        patientHistory,
        medicalHistory: medicalHistoryRecord,
      }));
    } catch (aiErr) {
      // 2026-08-10 fix: previously, any throw here left the session stuck
      // forever in S4_ai_triage_processing (no transition back to S2 exists
      // in sessionStateMachine.js -- only cancel_session works from S4).
      await prisma.session.update({
        where: { id: sessionId },
        data: { currentState: 'S2_collecting_information' },
      });
      recordAudit({
        userId: req.user.id,
        action: 'session_rolled_back_to_s2',
        entityType: 'Session',
        entityId: sessionId,
        metadata: { reason: aiErr.message },
      });
      throw aiErr;
    }

    const resolvedState = resolveStateForUrgency(urgencyLevel);
    if (!resolvedState) {
      throw new AppError(
        `AI module returned an unrecognized urgencyLevel: ${urgencyLevel}`,
        502,
        'AI_RESPONSE_INVALID',
      );
    }

    // Decision (project manager, 2026-07-12): finalize_triage is Role:System
    // in the diagram, so S6/S7/S8 go straight to S9 here ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â no separate
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
        await deductForCompletedTriage(req.user.id);
      } catch (walletErr) {
        // Best-effort: never let wallet deduction break the main flow.
      }
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
      try {
        await creditReferralIfApplicable(req.user.id);
      } catch (referralErr) {
        // Best-effort: never let referral crediting break the main flow.
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
// real doctor review panel (Phase 2, out of scope for this team) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â staff
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
      await deductForCompletedTriage(updated.userId);
    } catch (walletErr) {
      // Best-effort
    }
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
    try {
      await creditReferralIfApplicable(updated.userId);
    } catch (referralErr) {
      // Best-effort: never let referral crediting break the main flow.
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
// session ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â resubmission overwrites via upsert (project manager
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

// POST /sessions/:id/second-round-questions
// Round 2 of the two-step questions flow (2026-07-24, AI team). Called
// after the patient answered round-1's 5 questions. Either returns 5 more
// questions (session stays in S2, same as generate-questions) or -- if the
// AI escalates -- persists the final TriageResult and transitions state,
// exactly mirroring submit-symptoms's finalize logic.
async function secondRoundQuestions(req, res, next) {
  const sessionId = req.params.id;
  try {
    const session = await loadOwnedSessionOr404(sessionId, req.user.id);

    if (session.currentState !== 'S2_collecting_information') {
      throw new AppError(
        `Cannot request second-round questions from state ${session.currentState}`,
        409,
        'INVALID_STATE_TRANSITION',
      );
    }

    const { presentingProblemId, patientDetails, round1QuestionsAsked, round1Responses } = req.body;

    // 2026-08-01 (PM decision, reverting the 2026-07-27 age-direct fix):
    // birthDate is the real source of truth for age again.
    if (!patientDetails?.birthDate) {
      throw new AppError('Patient birthDate is required (patientDetails.birthDate)', 400, 'BIRTHDATE_REQUIRED');
    }
    if (Number.isNaN(new Date(patientDetails.birthDate).getTime())) {
      throw new AppError('Patient birthDate must be a valid date (e.g. 2000-05-15)', 400, 'BIRTHDATE_INVALID_FORMAT');
    }
    const age = calculateAge(patientDetails.birthDate);
    const patientHistory = await getRecentHistorySummary(req.user.id, 5);
    const medicalHistoryRecord = await prisma.medicalHistory.findUnique({ where: { userId: req.user.id } });

    const result = await generateSecondRoundQuestions({
      sessionId,
      presentingProblemId,
      age,
      sex: patientDetails?.gender,
      weightKg: patientDetails?.weightKg ?? patientDetails?.weight,
      heightCm: patientDetails?.heightCm ?? patientDetails?.height,
      otherSymptomsText: patientDetails?.otherSymptomsText,
      round1QuestionsAsked,
      round1Responses,
      patientHistory,
      medicalHistory: medicalHistoryRecord,
    });

    if (result.escalate === true) {
      const { urgencyLevel, triageResultJson } = result;
      const resolvedState = resolveStateForUrgency(urgencyLevel);
      if (!resolvedState) {
        throw new AppError(
          `AI module returned an unrecognized urgencyLevel: ${urgencyLevel}`,
          502,
          'AI_RESPONSE_INVALID',
        );
      }

      const isAutoFinalized = AUTO_FINALIZE_STATES.has(resolvedState);
      const finalState = isAutoFinalized ? 'S9_completed_triage' : resolvedState;

      const [, updatedSession] = await prisma.$transaction([
        prisma.triageResult.create({
          data: { sessionId, urgencyLevel, triageResultJson },
        }),
        prisma.session.update({
          where: { id: sessionId },
          data: { currentState: finalState, presentingProblemId },
          include: { triageResult: true },
        }),
      ]);

      recordAudit({
        userId: req.user.id,
        action: 'session_state_transition',
        entityType: 'Session',
        entityId: sessionId,
        metadata: { from: 'S2_collecting_information', to: finalState, urgencyLevel, autoFinalized: isAutoFinalized, source: 'second_round' },
      });

      if (isAutoFinalized) {
        try {
          await deductForCompletedTriage(req.user.id);
        } catch (walletErr) {
          // Best-effort: never let wallet deduction break the main flow.
        }
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
        try {
          await creditReferralIfApplicable(req.user.id);
        } catch (referralErr) {
          // Best-effort: never let referral crediting break the main flow.
        }
      }

      return res.status(200).json({ escalate: true, session: toPublicSession(updatedSession) });
    }

    return res.status(200).json({ escalate: false, questions: result.questions });
  } catch (err) {
    return next(err);
  }
}
module.exports = {
  secondRoundQuestions,
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
