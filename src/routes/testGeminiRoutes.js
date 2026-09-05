// ⚠️ TEMPORARY test-only route, added 2026-08-31 for experimental Gemini
// provider evaluation (Gemini API is geo-blocked from Iran, so this must
// be tested by calling it from Vercel/US, not from local dev). NOT part
// of the real API contract -- no auth, no rate limiting. MUST be removed
// before this branch is ever merged to main, or at minimum before any
// production use.
const express = require("express");
const { createGeminiProvider } = require("../ai/providers/geminiProvider");

const router = express.Router();

router.get("/test-gemini-live", async (req, res) => {
  try {
    const providerFn = createGeminiProvider("gemini-2.0-flash");
    const result = await providerFn({
      system: "You are a helpful assistant. Always respond with valid JSON only, no markdown formatting, no code fences.",
      user: 'Respond with this exact JSON: {"status": "ok", "test": true}',
    });
    return res.status(200).json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;