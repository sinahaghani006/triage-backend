function createGroqProvider(model) {
  return async function groqProviderFn({ system, user }) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
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
