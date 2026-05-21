import { NextResponse } from "next/server";

const BAKONG_TOKEN_FALLBACK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiYmU3ODdjMjFiMzE0NDUyNyJ9LCJpYXQiOjE3Nzc5MDI3MjYsImV4cCI6MTc4NTY3ODcyNn0.Q9JAfNOtBrcktn41QNb_Ve4mhf4eaYsdtCZRR6nBGVg";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const md5 = body?.md5;
    if (!md5 || typeof md5 !== "string") {
      return NextResponse.json({ ok: false, error: "Missing payment hash." }, { status: 400 });
    }

    const token = process.env.BAKONG_TOKEN || BAKONG_TOKEN_FALLBACK;
    const response = await fetch("https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ md5: md5.trim() }),
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      ...(data || {}),
      ...(data ? {} : text ? { bakongRaw: text.slice(0, 500) } : {}),
    }, { status: response.ok ? 200 : response.status });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to check payment.",
    }, { status: 500 });
  }
}
