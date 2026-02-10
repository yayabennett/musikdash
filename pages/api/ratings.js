const db = require('../../lib/db');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { song_id } = req.query;
      if (song_id) {
        const ratings = await db.getRatings(song_id);
        return res.json(ratings);
      }
      const all = await db.getAllRatings();
      res.json(all);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else if (req.method === 'POST') {
    try {
      const { song_id, username, melody, production, emotion, originality } = req.body;
      if (!song_id || !username) {
        return res.status(400).json({ error: 'song_id und username erforderlich' });
      }
      // Validate all scores are 1-5
      const scores = { melody, production, emotion, originality };
      for (const [key, val] of Object.entries(scores)) {
        const n = Number(val);
        if (!n || n < 1 || n > 5) {
          return res.status(400).json({ error: `${key} muss zwischen 1 und 5 sein` });
        }
      }
      const rating = await db.upsertRating(
        Number(song_id),
        username,
        Number(melody),
        Number(production),
        Number(emotion),
        Number(originality)
      );
      res.json(rating);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(405).end();
  }
}
