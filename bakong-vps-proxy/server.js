import http from "node:http";

const PORT = Number(process.env.PORT || 8788);
const BAKONG_TOKEN_FALLBACK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiYmU3ODdjMjFiMzE0NDUyNyJ9LCJpYXQiOjE3Nzc5MDI3MjYsImV4cCI6MTc4NTY3ODcyNn0.Q9JAfNOtBrcktn41QNb_Ve4mhf4eaYsdtCZRR6nBGVg";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const sendJson = (response, status, body) => {
  response.writeHead(status, corsHeaders);
  response.end(JSON.stringify(body));
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });

http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/bakong/check") {
    sendJson(response, 404, { ok: false, error: "Not found." });
    return;
  }

  try {
    const bodyText = await readBody(request);
    const body = bodyText ? JSON.parse(bodyText) : null;
    const md5 = body?.md5;
    if (!md5 || typeof md5 !== "string") {
      sendJson(response, 400, { ok: false, error: "Missing payment hash." });
      return;
    }

    const token = process.env.BAKONG_TOKEN || BAKONG_TOKEN_FALLBACK;
    const bakongResponse = await fetch("https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: JSON.stringify({ md5: md5.trim() }),
    });

    const text = await bakongResponse.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    sendJson(response, bakongResponse.ok ? 200 : bakongResponse.status, {
      ok: bakongResponse.ok,
      status: bakongResponse.status,
      ...(data || {}),
      ...(data ? {} : text ? { bakongRaw: text.slice(0, 500) } : {}),
    });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Unable to check payment." });
  }
}).listen(PORT, () => {
  console.log(`Bakong proxy listening on http://localhost:${PORT}/api/bakong/check`);
});
