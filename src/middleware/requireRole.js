const AppError = require("../utils/AppError");

function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!allowedRoles.includes(req.user?.role)) {
      return next(new AppError("This action requires elevated privileges", 403, "FORBIDDEN"));
    }
    return next();
  };
}

module.exports = requireRole;
