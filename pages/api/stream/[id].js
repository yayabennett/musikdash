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
    const song = await db.getSongById(Number(id));
    if (!song) return res.status(404).json({ error: 'not found' });

    const bucket = process.env.R2_BUCKET;
    // Support both new (just key) and legacy (full URL or /r2/key) formats
    let objectKey = song.filename;
    if (objectKey.startsWith('/r2/')) {
      objectKey = decodeURIComponent(objectKey.replace('/r2/', ''));
    } else if (objectKey.startsWith('http')) {
      const url = new URL(objectKey);
      const parts = url.pathname.split('/').filter(Boolean);
      objectKey = parts[0] === bucket
        ? decodeURIComponent(parts.slice(1).join('/'))
        : decodeURIComponent(parts.join('/'));
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
