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

module.exports = { getHistorySummary };
