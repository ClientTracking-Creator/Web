# Bakong VPS Proxy

Use this proxy on a small VPS or a trusted always-on computer when serverless hosts are blocked by Bakong/NBC.

## Run Locally

```powershell
cd bakong-vps-proxy
$env:BAKONG_TOKEN="your Bakong JWT token"
npm start
```

The endpoint is:

```text
http://localhost:8788/api/bakong/check
```

## Public VPS Setup

1. Install Node.js 20+ on the VPS.
2. Upload this `bakong-vps-proxy` folder.
3. Set `BAKONG_TOKEN` as an environment variable.
4. Run `npm start`.
5. Put the public URL in the web app Admin screen as `Bakong Proxy URL`.

The web app will try its own Vercel API first. If Bakong blocks Vercel, it will fall back to this configured proxy URL.
