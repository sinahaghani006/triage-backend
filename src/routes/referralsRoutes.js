const express = require("express");
const authenticate = require("../middleware/authenticate");
const referralsController = require("../controllers/referralsController");

const router = express.Router();
router.use(authenticate);
router.post("/redeem", referralsController.redeemReferralCode);

module.exports = router;