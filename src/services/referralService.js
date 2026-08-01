const prisma = require("../config/prismaClient");
const { REFERRAL_CREDITS_PER_SUCCESSFUL_INVITE } = require("../config/plans");
const { COST_PER_TRIAGE } = require("./walletService");

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion

function generateRandomCode(length = 8) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// GET-or-create: every user gets exactly one referral code, generated
// lazily on first request rather than at registration time.
async function getOrCreateReferralCode(userId) {
  const existing = await prisma.referralCode.findUnique({ where: { userId } });
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.referralCode.create({
        data: { userId, code: generateRandomCode() },
      });
    } catch (err) {
      if (err.code !== "P2002") throw err; // retry only on unique-code collision
    }
  }
  throw new Error("Could not generate a unique referral code after 5 attempts");
}

// 2026-08-01 (PM decision): credited only once the invited user completes
// one real triage -- never on signup alone, to prevent trivial abuse.
// creditsPerSuccessfulInvite (5) is interpreted as 5 free triages' worth
// of wallet balance (5 * COST_PER_TRIAGE Toman) -- confirm with PM if a
// different unit was intended.
async function creditReferralIfApplicable(invitedUserId) {
  const redemption = await prisma.referralRedemption.findUnique({
    where: { invitedUserId },
  });
  if (!redemption || redemption.creditedAt) return; // no referral, or already credited

  const referralCode = await prisma.referralCode.findUnique({
    where: { id: redemption.referralCodeId },
  });
  if (!referralCode) return;

  const creditAmountToman = REFERRAL_CREDITS_PER_SUCCESSFUL_INVITE * COST_PER_TRIAGE;

  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId: referralCode.userId },
      data: { balance: { increment: creditAmountToman } },
    }),
    prisma.referralRedemption.update({
      where: { id: redemption.id },
      data: { creditedAt: new Date() },
    }),
  ]);
}

module.exports = { getOrCreateReferralCode, creditReferralIfApplicable };