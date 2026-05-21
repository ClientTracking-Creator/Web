# ClientTracking Web - Notes For Next Time

Last updated: 2026-05-21

This project is the web version of the `clientTracking - V15` React Native mobile app. It is built with Next.js so it can run on desktop and phone browsers.

## Main Project

- Local folder: `D:\ClientTracking\clientTracking-web\clienttracking-web-next`
- GitHub repo: `https://github.com/ClientTracking-Creator/Web`
- Live Vercel app: `https://clienttracking-web-next.vercel.app`
- Framework: Next.js + React + TypeScript
- Main app screen/file: `src/app/page.tsx`

## Services Used

### 1. Vercel

Purpose:
- Hosts the web app online.
- Runs the Next.js build.
- Gives the free web URL.

Live app:
- `https://clienttracking-web-next.vercel.app`

Important:
- Production branch should be `main`.
- Framework should be `Next.js`.
- Root directory should be the project root, not `gh-pages` and not `vercel-bakong-proxy`.

Deploy from terminal:

```powershell
cd D:\ClientTracking\clientTracking-web\clienttracking-web-next
npm run build
npx vercel --prod --yes
```

After deploy, Vercel should show `Aliased https://clienttracking-web-next.vercel.app`.

### 2. GitHub

Purpose:
- Saves the code online.
- Lets Vercel deploy from the repo.

Push changes:

```powershell
cd D:\ClientTracking\clientTracking-web\clienttracking-web-next
git status
git add .
git commit -m "Describe what changed"
git push origin master
git push origin master:main
```

Use `git status` first so you can see what files changed.

### 3. Firebase

Purpose:
- Login/authentication.
- Firestore database for clients, records, settings, payments, admin config, and payment requests.

Config file:
- `src/config/firebase.ts`

Firebase project:
- `clienttrackingapp-43995`

Common data code:
- `src/context/ClientContext.tsx`
- `src/context/AuthContext.tsx`

Admin payment requests are saved in Firestore and shown in the Admin screen.

### 4. Cloudinary

Purpose:
- Stores uploaded images.
- Used for client photos, progress photos, ingredient photos, gym logo, profile pictures, and payment proof images.

Config file:
- `src/utils/cloudinary.ts`

Current Cloudinary values:
- cloud name is in `src/utils/cloudinary.ts`
- upload preset is in `src/utils/cloudinary.ts`

Upload folders:
- `client_tracking/{userId}/avatars`
- `client_tracking/{userId}/progress_photos`
- `client_tracking/{userId}/ingredients`
- `client_tracking/{userId}/branding`
- `client_tracking/{userId}/payment_proofs`

### 5. Bakong / KHQR Payment

Purpose:
- Creates KHQR payment QR codes.
- Checks payment status by MD5 when possible.
- Also supports manual payment proof upload when automatic verification is blocked.

Main payment file:
- `src/services/bakongService.ts`

Next.js payment API route:
- `src/app/api/bakong/check/route.ts`

Payment proof upload UI:
- `src/app/page.tsx`
- Search for `SubscriptionScreen`.

Current Bakong account ID:
- `engreaksmey_kimreach@bkrt`

Important:
- Do not put the full Bakong JWT token in this note file.
- In Vercel, keep the token in Environment Variables as `BAKONG_TOKEN`.

### 6. Payment Proxy Options

Reason:
- Browsers cannot safely call the Bakong/NBC API directly because of CORS.
- Some cloud IPs can also be blocked by Bakong/NBC with HTTP 403.

Current app behavior:
1. First tries the internal Vercel API route:
   - `/api/bakong/check/`
2. If that fails, tries the Admin setting:
   - `Bakong Proxy URL`
3. If automatic check still fails, user can upload bank transaction photo with `I have paid`.
4. Admin can approve the pending payment request manually.

Admin setting path:
- Open app.
- Login as admin.
- Go to Admin screen.
- Find Bakong Payment Setup.
- Set `Bakong Proxy URL`.

Cloudflare Worker files:
- `cloudflare/bakong-payment-worker.js`
- `cloudflare/wrangler.toml`

Deploy Cloudflare Worker:

```powershell
cd D:\ClientTracking\clientTracking-web\clienttracking-web-next
npx wrangler login
npm run deploy-worker
npx wrangler secret put BAKONG_TOKEN -c cloudflare/wrangler.toml
```

AWS/VPS proxy files:
- `bakong-vps-proxy/server.js`
- `bakong-vps-proxy/README.md`
- `bakong-vps-proxy/start-local-proxy.ps1`

AWS instance used before:
- Public IPv4: `18.142.239.238`
- Port: `8788`
- Proxy URL format: `http://18.142.239.238:8788/api/bakong/check`

Important:
- The AWS proxy can run, but Bakong/NBC may block AWS IPs with HTTP 403.
- If Bakong/NBC allowlists the server IP, the AWS proxy can work.
- The manual payment proof upload works even when automatic Bakong verification is blocked.

## How To Run Locally

```powershell
cd D:\ClientTracking\clientTracking-web\clienttracking-web-next
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

If port 3000 is busy, Next.js may choose another port.

## How To Check Before Deploy

Run:

```powershell
npm run build
npm run lint
```

Build must pass before deploy.

Lint may show old warnings. Warnings are not the same as errors, but they should be fixed later when there is time.

## Where To Edit Common Things

Main app UI:
- `src/app/page.tsx`

Translations, English and Khmer:
- `src/utils/i18n.ts`

Firebase connection:
- `src/config/firebase.ts`

Cloudinary upload:
- `src/utils/cloudinary.ts`

Bakong QR and payment check:
- `src/services/bakongService.ts`
- `src/app/api/bakong/check/route.ts`

Data models/types:
- `src/models/types.ts`

Database logic:
- `src/context/ClientContext.tsx`

Authentication:
- `src/context/AuthContext.tsx`

Global styles:
- `src/app/globals.css`

Next.js config:
- `next.config.ts`

## How To Add Or Change Khmer Text

Open:

```text
src/utils/i18n.ts
```

Each text key should have:
- English value.
- Khmer value.

If you add new text in the UI, add a translation key first, then use:

```tsx
t("yourKeyName")
```

Do not hard-code English text in the UI if the app needs Khmer support.

## How To Change Payment Proof Flow

Open:

```text
src/app/page.tsx
```

Search:

```text
SubscriptionScreen
```

Current flow:
1. User chooses plan.
2. User scans KHQR.
3. User can click `Check Payment`.
4. If automatic check fails, user clicks `I have paid`.
5. User must upload bank transaction photo.
6. User clicks `Send`.
7. Payment popup closes.
8. Admin sees the payment request in Admin screen.
9. Admin approves or rejects.

## How To Change App Colors / Button Style

Most UI classes are inside:

```text
src/app/page.tsx
```

Common colors:
- Lime accent: `#ccff00`
- Dark background: `#121212`
- Panel background: `#1e1e1e`
- Border: `#3a3a3c`
- Danger red: `#ff453a`

Be careful on phone screens:
- Use responsive Tailwind classes like `grid`, `flex`, `min-w-0`, `break-anywhere`, `sm:`, `md:`.
- Test small screen after changing buttons or text.

## Best Safe Workflow For Next Time

1. Open terminal:

```powershell
cd D:\ClientTracking\clientTracking-web\clienttracking-web-next
```

2. Pull latest code:

```powershell
git pull origin master
```

3. Run local app:

```powershell
npm run dev
```

4. Edit files.

5. Check:

```powershell
npm run build
npm run lint
```

6. Commit:

```powershell
git status
git add .
git commit -m "Your change message"
```

7. Deploy:

```powershell
npx vercel --prod --yes
```

8. Push GitHub:

```powershell
git push origin master
git push origin master:main
```

## Important Reminder

Never share or commit private secrets:
- Bakong JWT token.
- `.pem` SSH key.
- Any private API secret.

These should stay in:
- Vercel Environment Variables.
- Cloudflare Worker secrets.
- Local computer only.

