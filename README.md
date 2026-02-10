# Minimal Musik (Next.js)

Simple minimalistic Next.js site to upload and play songs.

Features
- Login with username `bennett` (no password) to enable uploads
- Upload audio files stored under `public/uploads`
- Metadata saved in a SQLite file at `.data/database.sqlite` (adapter: `lib/db.js`)

Setup

1. Install dependencies:

```bash
npm install
```

2. Configure Cloudflare R2 (optional)

Set these environment variables if you want uploads to go to Cloudflare R2:

- `R2_BUCKET` — your R2 bucket name
- `R2_ACCESS_KEY_ID` — R2 access key id
- `R2_SECRET_ACCESS_KEY` — R2 secret
- `R2_ENDPOINT` — optional endpoint base like `https://<accountid>.r2.cloudflarestorage.com`
- `R2_PUBLIC_URL_BASE` — optional public base URL for objects (alternative to `R2_ENDPOINT`)

If you don't set R2 env vars, uploads will error until configured. Provide these vars (for local dev, use a `.env.local` file).

3. Run development server:

```bash
npm run dev
```

Open http://localhost:3000

Notes
- I used a small SQLite adapter as a placeholder (`lib/db.js`). If you prefer another DB, tell me and I'll swap adapters.
- Uploaded files are sent to Cloudflare R2 when configured; the DB stores the public object URL.
