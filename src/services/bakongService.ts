import { COUNTRY, CURRENCY, KHQR, TAG } from "ts-khqr";
import md5 from "md5";
import { db } from "@/config/firebase";
import { doc, getDoc } from "firebase/firestore";

const BAKONG_ID = "engreaksmey_kimreach@bkrt";
const BAKONG_TOKEN_FALLBACK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiYmU3ODdjMjFiMzE0NDUyNyJ9LCJpYXQiOjE3Nzc5MDI3MjYsImV4cCI6MTc4NTY3ODcyNn0.Q9JAfNOtBrcktn41QNb_Ve4mhf4eaYsdtCZRR6nBGVg";

export type KHQRResponse = { qrString: string; md5: string };

export function generatePaymentQR(amount: number, currency: "USD" | "KHR" = "USD"): KHQRResponse {
  const khqrPayload = {
    tag: TAG.INDIVIDUAL,
    accountID: BAKONG_ID,
    merchantName: "Client Tracking App",
    merchantCity: "Phnom Penh",
    currency: currency === "USD" ? CURRENCY.USD : CURRENCY.KHR,
    amount,
    countryCode: COUNTRY.KH,
    storeLabel: "Client Tracking App",
    terminalLabel: "Web App",
    billNumber: `SUB-${Date.now()}`,
    expirationTimestamp: Date.now() + 5 * 60 * 1000,
  };

  const response = KHQR.generate(khqrPayload as never);

  const qrString = response?.data?.qr || "";
  return { qrString, md5: response?.data?.md5 || md5(qrString || "") };
}

async function getBakongToken() {
  try {
    const snap = await getDoc(doc(db, "admin", "config"));
    const token = snap.exists() ? snap.data().bakongToken : "";
    return typeof token === "string" && token.trim() ? token.trim() : BAKONG_TOKEN_FALLBACK;
  } catch {
    return BAKONG_TOKEN_FALLBACK;
  }
}

async function checkPaymentStatusDirect(md5Hash: string) {
  const token = await getBakongToken();
  const response = await fetch("https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ md5: md5Hash }),
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, ...data };
}

export async function checkPaymentStatus(md5Hash: string) {
  try {
    const response = await fetch("/api/bakong/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ md5: md5Hash }),
    });
    if (response.ok) return await response.json();
  } catch {
    // Static hosts such as GitHub Pages cannot run the Next API route.
  }

  try {
    return await checkPaymentStatusDirect(md5Hash);
  } catch {
    return null;
  }
}
