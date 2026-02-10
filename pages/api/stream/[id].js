const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const db = require('../../../lib/db');

function getS3Client() {
  const endpoint = process.env.R2_ENDPOINT || null;
  const region = process.env.R2_REGION || 'auto';
  const clientConfig = {
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    region,
  };
  if (endpoint) clientConfig.endpoint = endpoint;
  return new S3Client(clientConfig);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { id } = req.query;
  try {
    const songs = await db.getSongs();
    const song = songs.find((s) => String(s.id) === String(id));
    if (!song) return res.status(404).json({ error: 'not found' });

    // Extract the R2 object key from the stored URL
    const bucket = process.env.R2_BUCKET;
    let objectKey = '';

    // The stored filename looks like: https://...cloudflarestorage.com/bucket/KEY
    // or /r2/KEY
    if (song.filename.startsWith('/r2/')) {
      objectKey = decodeURIComponent(song.filename.replace('/r2/', ''));
    } else {
      // extract key from full URL: endpoint/bucket/key
      const url = new URL(song.filename);
      const parts = url.pathname.split('/').filter(Boolean);
      // remove bucket name if it's the first segment
      if (parts[0] === bucket) {
        objectKey = decodeURIComponent(parts.slice(1).join('/'));
      } else {
        objectKey = decodeURIComponent(parts.join('/'));
      }
    }

    const client = getS3Client();
    const command = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
    const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });

    res.redirect(302, signedUrl);
  } catch (err) {
    console.error('[stream] Error:', err);
    res.status(500).json({ error: err.message });
  }
}
