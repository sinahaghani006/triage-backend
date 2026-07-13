const { getPresentingProblems } = require('../services/aiTriageGateway');

// GET /presenting-problems — public reference data (no auth), used by
// Frontend to build the one-step symptom form (id + label only; the AI
// member confirmed "suggestedFollowUpAreas" is internal-only, not
// patient-facing, so it is deliberately excluded).
function listPresentingProblems(req, res, next) {
  try {
    const problems = getPresentingProblems();
    return res.status(200).json({ presentingProblems: problems });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listPresentingProblems };
