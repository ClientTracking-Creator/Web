const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { ok: false, error: "Method not allowed." });

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const md5 = body?.md5;
    if (!md5 || typeof md5 !== "string") return json(400, { ok: false, error: "Missing payment hash." });

    const token = process.env.BAKONG_TOKEN;
    if (!token) return json(500, { ok: false, error: "BAKONG_TOKEN is not configured." });

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

    return json(response.ok ? 200 : response.status, {
      ok: response.ok,
      status: response.status,
      ...(data || {}),
      ...(data ? {} : text ? { bakongRaw: text.slice(0, 500) } : {}),
    });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : "Unable to check payment." });
  }
}

