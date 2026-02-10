const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(process.cwd(), '.data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'database.sqlite');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      originalname TEXT,
      uploader TEXT,
      type TEXT DEFAULT 'song',
      uploaded_at INTEGER
    )`
  );
  // Add type column if it exists but table was created before
  db.run("ALTER TABLE songs ADD COLUMN type TEXT DEFAULT 'song'", (err) => {
    // ignore error if column already exists
  });

  db.run(
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
});

module.exports = {
  getSongs: () =>
    new Promise((resolve, reject) => {
      db.all('SELECT * FROM songs ORDER BY uploaded_at DESC', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    }),

  addSong: (filename, originalname, uploader, type = 'song') =>
    new Promise((resolve, reject) => {
      const ts = Date.now();
      db.run(
        'INSERT INTO songs (filename, originalname, uploader, type, uploaded_at) VALUES (?, ?, ?, ?, ?)',
        [filename, originalname, uploader, type, ts],
        function (err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, filename, originalname, uploader, type, uploaded_at: ts });
        }
      );
    }),

  deleteSong: (id) =>
    new Promise((resolve, reject) => {
      db.run('DELETE FROM ratings WHERE song_id = ?', [id], () => {
        db.run('DELETE FROM songs WHERE id = ?', [id], function (err) {
          if (err) return reject(err);
          resolve({ deleted: this.changes });
        });
      });
    }),

  getRatings: (songId) =>
    new Promise((resolve, reject) => {
      db.all('SELECT * FROM ratings WHERE song_id = ? ORDER BY rated_at DESC', [songId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    }),

  getAllRatings: () =>
    new Promise((resolve, reject) => {
      db.all('SELECT * FROM ratings ORDER BY rated_at DESC', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    }),

  upsertRating: (songId, username, melody, production, emotion, originality) =>
    new Promise((resolve, reject) => {
      const ts = Date.now();
      db.run(
        `INSERT INTO ratings (song_id, username, melody, production, emotion, originality, rated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(song_id, username) DO UPDATE SET
           melody = excluded.melody,
           production = excluded.production,
           emotion = excluded.emotion,
           originality = excluded.originality,
           rated_at = excluded.rated_at`,
        [songId, username, melody, production, emotion, originality, ts],
        function (err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, song_id: songId, username, melody, production, emotion, originality, rated_at: ts });
        }
      );
    }),
};
