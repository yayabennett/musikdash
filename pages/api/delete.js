const db = require('../../lib/db');

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end();

  const cookie = require('cookie');
  const cookies = cookie.parse(req.headers.cookie || '');
  if (cookies.username !== 'bennett') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const { id } = req.query;
  try {
    await db.deleteSong(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
