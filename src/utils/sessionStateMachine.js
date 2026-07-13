// Encodes the state machine defined by the project manager. S1 (initial_state)
// is treated as a transient pre-persistence state: the create_session action
// takes it straight to S2, so no row is ever actually stored as S1 — this is
// a documented internal decision, not a change to any external contract.
//
// S3 (assign_urgency) is likewise transient: submit_symptoms moves a session
// to S4, and once the AI module responds, the backend resolves S4 -> S3 -> one
// of S5-S8 in a single step (S3 itself is never the row's persisted state,
// same treatment as S1).

const URGENCY_TO_STATE = {
  emergency: 'S6_marked_emergency',
  doctor_review: 'S5_pending_doctor_review',
  home_treatment: 'S7_marked_home_treatment',
  normal: 'S8_marked_normal',
};

// Decision (project manager, 2026-07-12): finalize_triage's Role in the
// original diagram is "System", so S6/S7/S8 (AI's own final outcomes) are
// finalized automatically inside submit-symptoms — no separate Frontend
// call. S5 (pending_doctor_review) is deliberately excluded: its name means
// an open state waiting on a real doctor's action, so it must NOT
// auto-finalize. Moving S5 -> S9 is only done by the staff-only
// /sessions/:id/staff-finalize endpoint (minimal Phase-1 stand-in; a real
// doctor review panel is out of scope for this team, planned Phase 2).
const AUTO_FINALIZE_STATES = new Set([
  'S6_marked_emergency',
  'S7_marked_home_treatment',
  'S8_marked_normal',
]);
const STAFF_REVIEW_STATE = 'S5_pending_doctor_review';

const TERMINAL_STATES = new Set(['S9_completed_triage', 'S10_cancelled_by_user']);

const FINAL_TRIAGE_STATES = new Set(Object.values(URGENCY_TO_STATE));

// Allowed "from" states for each action.
const TRANSITIONS = {
  submit_symptoms: ['S2_collecting_information'],
  // Only S5 goes through explicit finalize_triage now — S6/S7/S8 are
  // resolved straight to S9 inside submit-symptoms itself (see above).
  finalize_triage: [STAFF_REVIEW_STATE],
  close_session: ['S9_completed_triage'],
  // cancel_session is allowed from any non-terminal state (checked separately).
};

function isTerminal(state) {
  return TERMINAL_STATES.has(state);
}

function canTransition(action, fromState) {
  if (action === 'cancel_session') {
    return !isTerminal(fromState);
  }
  const allowedFrom = TRANSITIONS[action];
  return Boolean(allowedFrom && allowedFrom.includes(fromState));
}

function resolveStateForUrgency(urgencyLevel) {
  return URGENCY_TO_STATE[urgencyLevel] || null;
}

module.exports = {
  URGENCY_TO_STATE,
  TERMINAL_STATES,
  FINAL_TRIAGE_STATES,
  AUTO_FINALIZE_STATES,
  STAFF_REVIEW_STATE,
  isTerminal,
  canTransition,
  resolveStateForUrgency,
};
