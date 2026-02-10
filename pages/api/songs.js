const db = require('../../lib/db');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const songs = await db.getSongs();
      res.json(songs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID erforderlich' });
    try {
      await db.deleteSong(id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(405).end();
  }
}
