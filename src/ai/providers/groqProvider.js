function createGroqProvider(model) {
  return async function groqProviderFn({ system, user }) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        // 2026-07-22 permanent fix (AI team suggestion): some requests without
        // an explicit User-Agent were intermittently rejected with 403 by
        // Groq's edge/Cloudflare layer. Node's default fetch does not always
        // send one reliably in serverless environments. A stable, explicit
        // User-Agent avoids this regardless of runtime.
        "User-Agent": "triage-backend/1.0 (+https://triage-backend-nine.vercel.app)",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API error (${response.status}): ${errText}`);
    }
    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content;
    if (typeof rawText !== "string") {
      throw new Error("Groq API response missing choices[0].message.content");
    }
    return { rawText, meta: { provider: "groq", model } };
  };
}
module.exports = { createGroqProvider };