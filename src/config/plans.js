// src/config/plans.js
// Centralized plan/pricing constants (PM-provided, 2026-08-01, still
// marked "test values" pending final revenue decision -- update here only).
const PLANS = {
  FREEMIUM: { code: "FREEMIUM", label: "رایگان", dailyFreeTriages: 5, triages: null, price: 0 },
  SILVER:   { code: "SILVER",   label: "نقره‌ای", triages: 10,  price: 40000 },
  GOLD:     { code: "GOLD",     label: "طلایی",   triages: 30,  price: 105000 },
  DIAMOND:  { code: "DIAMOND",  label: "الماس",   triages: 100, price: 300000 },
};

const REFERRAL_CREDITS_PER_SUCCESSFUL_INVITE = 5;

module.exports = { PLANS, REFERRAL_CREDITS_PER_SUCCESSFUL_INVITE };