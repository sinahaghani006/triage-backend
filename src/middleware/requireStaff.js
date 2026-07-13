const AppError = require('../utils/AppError');

// Must run AFTER authenticate (needs req.user.role already set). Staff
// accounts are created manually via SQL for this Phase-1 stand-in — see
// README, "GET /sessions/:id/staff-finalize" section.
function requireStaff(req, res, next) {
  if (req.user?.role !== 'staff') {
    return next(new AppError('This action requires staff privileges', 403, 'FORBIDDEN'));
  }
  return next();
}

module.exports = requireStaff;
