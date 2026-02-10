const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize tables
let initialized = false;
async function init() {
  if (initialized) return;
  await client.execute(
    `CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      originalname TEXT,
      uploader TEXT,
      type TEXT DEFAULT 'song',
      uploaded_at INTEGER
    )`
  );
  await client.execute(
    `CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      melody INTEGER DEFAULT 0,
      production INTEGER DEFAULT 0,
      emotion INTEGER DEFAULT 0,
      originality INTEGER DEFAULT 0,
      rated_at INTEGER,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
      UNIQUE(song_id, username)
    )`
  );
  initialized = true;
}

module.exports = {
  getSongs: async () => {
    await init();
    const result = await client.execute('SELECT * FROM songs ORDER BY uploaded_at DESC');
    return result.rows;
  },

  getSongById: async (id) => {
    await init();
    const result = await client.execute({
      sql: 'SELECT * FROM songs WHERE id = ?',
      args: [id],
    });
    return result.rows[0] || null;
  },

  addSong: async (filename, originalname, uploader, type = 'song') => {
    await init();
    const ts = Date.now();
    const result = await client.execute({
      sql: 'INSERT INTO songs (filename, originalname, uploader, type, uploaded_at) VALUES (?, ?, ?, ?, ?)',
      args: [filename, originalname, uploader, type, ts],
    });
    return { id: Number(result.lastInsertRowid), filename, originalname, uploader, type, uploaded_at: ts };
  },

  deleteSong: async (id) => {
    await init();
    await client.execute({ sql: 'DELETE FROM ratings WHERE song_id = ?', args: [id] });
    const result = await client.execute({ sql: 'DELETE FROM songs WHERE id = ?', args: [id] });
    return { deleted: result.rowsAffected };
  },

  getRatings: async (songId) => {
    await init();
    const result = await client.execute({
      sql: 'SELECT * FROM ratings WHERE song_id = ? ORDER BY rated_at DESC',
      args: [songId],
    });
    return result.rows;
  },

  getAllRatings: async () => {
    await init();
    const result = await client.execute('SELECT * FROM ratings ORDER BY rated_at DESC');
    return result.rows;
  },

  upsertRating: async (songId, username, melody, production, emotion, originality) => {
    await init();
    const ts = Date.now();
    await client.execute({
      sql: `INSERT INTO ratings (song_id, username, melody, production, emotion, originality, rated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(song_id, username) DO UPDATE SET
              melody = excluded.melody,
              production = excluded.production,
              emotion = excluded.emotion,
              originality = excluded.originality,
              rated_at = excluded.rated_at`,
      args: [songId, username, melody, production, emotion, originality, ts],
    });
    return { song_id: songId, username, melody, production, emotion, originality, rated_at: ts };
  },
};
