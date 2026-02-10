# 🎵 Musik — Music Library by Bennett

A minimalistic, modern music library web application with cloud storage, real-time ratings, and a custom audio player.

## Features

✨ **Core Features**
- 🎵 **Song Upload & Management** — Upload audio files with type classification (Song/Sketch)
- 🎛️ **Custom Audio Player** — Modern player with equalizer, volume control (-60dB to 0dB range), and smooth seekbar
- ⭐ **Multi-User Ratings** — Rate songs on 4 creative criteria: Melodie, Produktion, Emotion, Originalität (1-5 stars)
- 👥 **User Profiles** — Any username (≥2 chars) can log in; admin (bennett) can upload/delete
- 📊 **Rating Analytics** — View average ratings, per-criterion breakdowns, and see who rated what
- 🎨 **Premium UI** — Glassmorphism design with ambient animations, premium fonts (DM Sans, Space Mono)

## Tech Stack

- **Frontend**: Next.js 13.4.7, React 18.2.0, CSS3 (custom animations)
- **Backend**: Next.js API Routes
- **Storage**: Cloudflare R2 (S3-compatible object storage)
- **Database**: SQLite3 with CommonJS
- **File Upload**: Formidable 2.0.1
- **AWS SDK**: For R2 integration and presigned URL generation

## Project Structure

```
/
├── pages/
│   ├── _app.js                    # App wrapper
│   ├── index.js                   # Main UI (login, upload, player, ratings)
│   └── api/
│       ├── upload.js              # Audio upload handler
│       ├── songs.js               # GET songs, DELETE song
│       ├── ratings.js             # GET/POST ratings
│       └── stream/[id].js         # Presigned URL streaming
├── lib/
│   └── db.js                      # SQLite connection, schema, CRUD
├── styles/
│   └── globals.css                # Design system (animations, components)
└── package.json
```

## Setup Instructions

### 1. Clone Repository
```bash
git clone <repo-url>
cd musik
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_R2_BUCKET=your-bucket-name
NEXT_PUBLIC_R2_REGION=auto
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_ENDPOINT=https://your-account.r2.cloudflarecustomers.com
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Login**: Enter any username (min. 2 chars). Use `bennett` for admin features.
2. **Upload** (bennett only): Drag/drop or click to upload audio. Select type: Song or Sketch.
3. **Play**: Click the play button. Adjust volume (-60dB to 0dB).
4. **Rate** (any user): Click on a song to expand and rate on 4 criteria.
5. **View Ratings**: See all user ratings with names and dates.

## Database

**songs**: id, filename, originalname, uploader, type, uploaded_at  
**ratings**: id, song_id, username, melody, production, emotion, originality, rated_at

## License

© 2026 Bennett. All rights reserved.
