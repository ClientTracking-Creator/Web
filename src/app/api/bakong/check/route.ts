import { db } from "@/config/firebase";
import { doc, getDoc } from "firebase/firestore";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BAKONG_TOKEN_FALLBACK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiYmU3ODdjMjFiMzE0NDUyNyJ9LCJpYXQiOjE3Nzc5MDI3MjYsImV4cCI6MTc4NTY3ODcyNn0.Q9JAfNOtBrcktn41QNb_Ve4mhf4eaYsdtCZRR6nBGVg";

async function getBakongToken() {
  try {
    const snap = await getDoc(doc(db, "admin", "config"));
    if (snap.exists() && snap.data().bakongToken) return snap.data().bakongToken as string;
  } catch {
    return BAKONG_TOKEN_FALLBACK;
  }
  return BAKONG_TOKEN_FALLBACK;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const md5 = typeof body?.md5 === "string" ? body.md5.trim() : "";
    if (!md5) return NextResponse.json({ ok: false, error: "Missing payment hash." }, { status: 400 });

    const token = await getBakongToken();
    const response = await fetch("https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ md5 }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);
    return NextResponse.json({ ok: response.ok, status: response.status, ...data }, { status: response.ok ? 200 : response.status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to check payment." }, { status: 500 });
  }
}
