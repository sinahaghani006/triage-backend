const prisma = require("../config/prismaClient");
const AppError = require("../utils/AppError");

const DAILY_TRIAGE_LIMIT = 3; // TEMP for testing daily-limit logic, will restore to 20 right after
const COST_PER_TRIAGE = 5000; // Toman (project manager decision 2026-07-24) -- was 10000

async function countTodaysCompletedTriages(userId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return prisma.patientHistorySummary.count({
    where: { userId, createdAt: { gte: startOfDay } },
  });
}

async function assertCanStartTriage(userId) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || wallet.balance < COST_PER_TRIAGE) {
    throw new AppError(
      "Insufficient wallet balance for a new triage",
      402,
      "INSUFFICIENT_BALANCE",
    );
  }

  const todaysCount = await countTodaysCompletedTriages(userId);
  if (todaysCount >= DAILY_TRIAGE_LIMIT) {
    throw new AppError(
      "Daily triage limit reached. Please upgrade your plan to continue today.",
      429,
      "DAILY_LIMIT_REACHED",
    );
  }
}

async function deductForCompletedTriage(userId) {
  await prisma.wallet.update({
    where: { userId },
    data: { balance: { decrement: COST_PER_TRIAGE } },
  });
}

async function getWallet(userId) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  const todaysCount = await countTodaysCompletedTriages(userId);
  return {
    balance: wallet?.balance ?? 0,
    todaysCompletedTriages: todaysCount,
    dailyLimit: DAILY_TRIAGE_LIMIT,
    costPerTriage: COST_PER_TRIAGE,
  };
}

module.exports = {
  assertCanStartTriage,
  deductForCompletedTriage,
  getWallet,
  DAILY_TRIAGE_LIMIT,
  COST_PER_TRIAGE,
};
