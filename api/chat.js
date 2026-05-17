import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Set these in Vercel environment variables
const MAKE_SAVE_WEBHOOK = process.env.MAKE_SAVE_WEBHOOK_URL;
const MAKE_LOAD_WEBHOOK = process.env.MAKE_LOAD_WEBHOOK_URL;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", SHOPIFY_STORE_URL || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action, messages, systemPrompt, customerEmail, customerId, customerName, sessionId, message, role } = req.body;

  // ── LOAD conversation history ──
  if (action === "load") {
    try {
      if (!MAKE_LOAD_WEBHOOK) return res.status(200).json({ messages: [] });

      const response = await fetch(MAKE_LOAD_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_email: customerEmail, customer_id: customerId }),
      });

      const data = await response.json();

      // Make.com returns array of rows — map to {role, content} format
      const history = Array.isArray(data)
        ? data.map(row => ({ role: row.role, content: row.message }))
        : [];

      return res.status(200).json({ messages: history });

    } catch (err) {
      console.error("Load error:", err);
      return res.status(200).json({ messages: [] });
    }
  }

  // ── SAVE a message ──
  if (action === "save") {
    try {
      if (!MAKE_SAVE_WEBHOOK) return res.status(200).json({ ok: true });

      await fetch(MAKE_SAVE_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id:    customerId,
          customer_email: customerEmail,
          customer_name:  customerName,
          session_id:     sessionId,
          role:           role,
          message:        message,
          timestamp:      new Date().toISOString(),
        }),
      });

      return res.status(200).json({ ok: true });

    } catch (err) {
      console.error("Save error:", err);
      return res.status(200).json({ ok: true });
    }
  }

  // ── CHAT ──
  if (action === "chat" || !action) {
    try {
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Invalid messages format" });
      }

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt || "You are a helpful assistant.",
        messages: messages.slice(-20),
      });

      return res.status(200).json({ content: response.content[0]?.text || "" });

    } catch (error) {
      console.error("Claude API error:", error);
      return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  }

  return res.status(400).json({ error: "Unknown action" });
}
