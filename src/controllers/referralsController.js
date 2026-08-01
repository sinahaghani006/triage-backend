const prisma = require("../config/prismaClient");
const AppError = require("../utils/AppError");
const { getOrCreateReferralCode } = require("../services/referralService");

// GET /users/me/referral-code
async function getMyReferralCode(req, res, next) {
  try {
    const referralCode = await getOrCreateReferralCode(req.user.id);
    return res.status(200).json({ code: referralCode.code });
  } catch (err) {
    return next(err);
  }
}

// POST /referrals/redeem -- body: { code }. Called once, right after
// registration, before the user has completed any triage.
async function redeemReferralCode(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) {
      throw new AppError("code is required", 400, "VALIDATION_ERROR");
    }

    const referralCode = await prisma.referralCode.findUnique({ where: { code } });
    if (!referralCode) {
      throw new AppError("Invalid referral code", 404, "REFERRAL_CODE_NOT_FOUND");
    }
    if (referralCode.userId === req.user.id) {
      throw new AppError("You cannot redeem your own referral code", 400, "SELF_REFERRAL_NOT_ALLOWED");
    }

    const existing = await prisma.referralRedemption.findUnique({
      where: { invitedUserId: req.user.id },
    });
    if (existing) {
      throw new AppError("You have already redeemed a referral code", 409, "REFERRAL_ALREADY_REDEEMED");
    }

    await prisma.referralRedemption.create({
      data: { referralCodeId: referralCode.id, invitedUserId: req.user.id },
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getMyReferralCode, redeemReferralCode };