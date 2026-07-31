const { PLANS } = require('../config/plans');

// GET /plans -- public, no auth. Frontend uses this to render the
// upgrade/pricing screen. Test values per PM (2026-08-01), not final.
function listPlans(req, res, next) {
  try {
    return res.status(200).json({ plans: Object.values(PLANS) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listPlans };