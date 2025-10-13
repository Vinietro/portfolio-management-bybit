import { NextResponse } from "next/server";

const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const TELEGRAM_URL = `https://api.telegram.org/bot8242037075:AAEIYbLIuxIQpEln4aEAki4bVGUXPdZd2Y4/sendMessage`;

// Small in-memory queue to space messages
let lastSendTime = 0;

export async function POST(req: Request) {
  try {
    const data = await req.json();
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

    const result = await response.json();
    if (!response.ok) {
      console.error("Telegram error:", result);
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}