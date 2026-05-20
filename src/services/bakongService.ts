import { COUNTRY, CURRENCY, KHQR, TAG } from "ts-khqr";
import md5 from "md5";
import { db } from "@/config/firebase";
import { doc, getDoc } from "firebase/firestore";

const BAKONG_ID = "engreaksmey_kimreach@bkrt";

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

async function getBakongProxyUrl() {
  try {
    const snap = await getDoc(doc(db, "admin_config", "app"));
    const proxyUrl = snap.exists() ? snap.data().bakongProxyUrl : "";
    if (typeof proxyUrl === "string" && proxyUrl.trim()) return proxyUrl.trim();
  } catch {
    // Fall through to environment fallback below.
  }
  return process.env.NEXT_PUBLIC_BAKONG_PROXY_URL || "";
}

export async function checkPaymentStatus(md5Hash: string) {
  const proxyUrl = await getBakongProxyUrl();
  if (!proxyUrl) {
    return { ok: false, error: "Payment checker is not configured. Add the Bakong proxy URL in Admin." };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(proxyUrl, {
      cache: "no-store",
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "follow",
      keepalive: false,
      signal: controller.signal,
      body: JSON.stringify({ md5: md5Hash }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const fallbackError = `Unable to check payment (HTTP ${response.status}).`;
      return { ok: false, status: response.status, error: data?.error || data?.responseMessage || fallbackError, ...data };
    }
    return { ok: true, status: response.status, ...data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to check payment." };
  } finally {
    window.clearTimeout(timeout);
  }
}
