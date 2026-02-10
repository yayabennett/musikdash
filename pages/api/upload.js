export const config = {
  api: {
    bodyParser: false,
  },
};

const formidable = require('formidable');
const fs = require('fs');
const cookie = require('cookie');
const db = require('../../lib/db');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

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
  console.log('[upload] Request received');
  
  if (req.method !== 'POST') return res.status(405).end();

  const cookies = cookie.parse(req.headers.cookie || '');
  const username = cookies.username || '';
  console.log('[upload] Username:', username);
  
  if (username !== 'bennett') return res.status(403).json({ error: 'forbidden' });

  const form = formidable({
    keepExtensions: true,
  });
  
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('[upload] Parse error:', err);
      return res.status(500).json({ error: 'parse error: ' + err.message });
    }
    
    console.log('[upload] Files received:', Object.keys(files));
    const file = files.song?.[0] || files.song || files.file?.[0] || files.file;
    
    let type = 'song';
    if (Array.isArray(fields.type)) {
      type = fields.type[0];
    } else if (fields.type) {
      type = fields.type;
    }
    
    if (!file) return res.status(400).json({ error: 'no file' });

    console.log('[upload] File path:', file.filepath);
    const rawPath = file.filepath || file.path;
    let buffer;
    try {
      buffer = fs.readFileSync(rawPath);
      console.log('[upload] File read, size:', buffer.length);
    } catch (e) {
      console.error('[upload] Read error:', e);
      return res.status(500).json({ error: 'failed to read uploaded file' });
    }

    const bucket = process.env.R2_BUCKET;
    if (!bucket || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      console.error('[upload] R2 not configured');
      return res.status(500).json({ error: 'R2 not configured (set R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, optionally R2_ENDPOINT)' });
    }

    const key = Date.now() + '_' + (file.originalFilename || file.name || 'upload');
    console.log('[upload] Uploading to R2 bucket:', bucket, 'key:', key);
    const client = getS3Client();

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: file.mimetype || 'application/octet-stream',
        })
      );
      console.log('[upload] R2 upload successful');
    } catch (e) {
      console.error('[upload] R2 upload failed:', e);
      return res.status(500).json({ error: 'upload to R2 failed: ' + e.message });
    }

    console.log('[upload] R2 key:', key);

    try {
      const song = await db.addSong(key, file.originalFilename || file.name || key, username, type);
      console.log('[upload] DB entry created:', song.id);
      res.json(song);
    } catch (e) {
      console.error('[upload] DB error:', e);
      res.status(500).json({ error: e.message });
    }
  });
}
