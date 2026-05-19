const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const json = (body, init = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: { ...corsHeaders, ...(init.headers || {}) },
});

const worker = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed." }, { status: 405 });
    }

    try {
      const { md5 } = await request.json();
      if (!md5 || typeof md5 !== "string") {
        return json({ ok: false, error: "Missing payment hash." }, { status: 400 });
      }

      if (!env.BAKONG_TOKEN) {
        return json({ ok: false, error: "BAKONG_TOKEN is not configured in the Worker." }, { status: 500 });
      }

      const response = await fetch("https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.BAKONG_TOKEN}`,
        },
        body: JSON.stringify({ md5: md5.trim() }),
      });
      const data = await response.json().catch(() => null);

      return json({
        ok: response.ok,
        status: response.status,
        ...(data || {}),
      }, { status: response.ok ? 200 : response.status });
    } catch (error) {
      return json({
        ok: false,
        error: error instanceof Error ? error.message : "Unable to check payment.",
      }, { status: 500 });
    }
  },
};

export default worker;
