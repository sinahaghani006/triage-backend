const express = require("express");
const doctorController = require("../controllers/doctorController");
const authenticate = require("../middleware/authenticate");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

router.use(authenticate);
router.use(requireRole("doctor", "admin"));

router.get("/patients", doctorController.listPatients);
router.get("/patients/:id", doctorController.getPatientDetail);
router.post("/patients/:id/ai-assistant", doctorController.getAiAssistant);
router.patch("/patients/:id/review-status", doctorController.updateReviewStatus);

module.exports = router;