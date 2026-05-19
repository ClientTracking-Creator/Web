import { COUNTRY, CURRENCY, KHQR, TAG } from "ts-khqr";
import md5 from "md5";

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

export async function checkPaymentStatus(md5Hash: string) {
  try {
    const response = await fetch("/api/bakong/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ md5: md5Hash }),
    });
    return await response.json();
  } catch {
    return null;
  }
}
