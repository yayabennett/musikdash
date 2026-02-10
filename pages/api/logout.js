const cookie = require('cookie');

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();
  res.setHeader('Set-Cookie', cookie.serialize('username', '', { path: '/', maxAge: 0 }));
  res.json({ ok: true });
}
