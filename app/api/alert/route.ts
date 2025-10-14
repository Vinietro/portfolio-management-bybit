import { NextResponse } from "next/server";

const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const TELEGRAM_URL = `https://api.telegram.org/bot8242037075:AAEIYbLIuxIQpEln4aEAki4bVGUXPdZd2Y4/sendMessage`;

// Small in-memory queue to space messages
let lastSendTime = 0;

export async function POST(req: Request) {
  try {
    // Read the raw body as text first to handle potential malformed JSON
    const rawBody = await req.text();
    console.log("Raw request body:", rawBody);
    
    let data;
    try {
      // Try to parse the JSON
      data = JSON.parse(rawBody);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      // Attempt to sanitize the body by removing/escaping control characters
      const sanitized = rawBody.replace(/[\x00-\x1F\x7F]/g, (char) => {
        // Replace common control characters with escaped versions
        switch (char) {
          case '\n': return '\\n';
          case '\r': return '\\r';
          case '\t': return '\\t';
          default: return ''; // Remove other control characters
        }
      });
      console.log("Sanitized body:", sanitized);
      data = JSON.parse(sanitized);
    }
    
    console.log("Parsed request:", data);
    const { chat_id = CHAT_ID, text } = data;

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    // Respect Telegram's rate limits
    const now = Date.now();
    const timeSinceLast = now - lastSendTime;
    const delay = timeSinceLast < 1200 ? 1200 - timeSinceLast : 0;

    await new Promise((r) => setTimeout(r, delay));
    lastSendTime = Date.now();

    const response = await fetch(TELEGRAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text,
        parse_mode: "Markdown",
      }),
    });

    console.log("Telegram request:", {
      chat_id,
      text,
      parse_mode: "Markdown",
    });
    console.log("Telegram response:", response);

    const result = await response.json();
    if (!response.ok) {
      console.error("Telegram error:", result);
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}