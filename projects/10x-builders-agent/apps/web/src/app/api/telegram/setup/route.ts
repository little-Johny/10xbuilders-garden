import { NextResponse } from "next/server";

/** Public HTTPS origin for Telegram (must be :443 / allowed ports). Not localhost. */
function publicOriginForWebhook(request: Request): string {
  const fromEnv = process.env.TELEGRAM_WEBHOOK_BASE_URL?.replace(/\/+$/, "");
  if (fromEnv) {
    return fromEnv;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const host = forwardedHost.split(",")[0]?.trim();
    if (host) {
      const proto =
        request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
      return `${proto}://${host}`;
    }
  }

  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  const origin = publicOriginForWebhook(request);
  const webhookUrl = `${origin}/api/telegram/webhook`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      ...(secret ? { secret_token: secret } : {}),
    }),
  });

  const data = await res.json();
  return NextResponse.json({ webhookUrl, telegram: data });
}
