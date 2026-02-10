const cookie = require('cookie');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { username } = req.body;
  if (username === 'bennett') {
    res.setHeader('Set-Cookie', cookie.serialize('username', encodeURIComponent(username), {
      path: '/',
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 7,
    }));
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'invalid' });
  }
}
