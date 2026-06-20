const crypto = require('crypto');

function verifyToken(token) {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [id, expires, sig] = parts;
    if (Date.now() > parseInt(expires, 10)) return false;
    const secret = process.env.JWT_SECRET;
    if (!secret) return false;
    const payload = `${id}.${expires}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, 64);
}

function getToken(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)epd_session=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  return (req.headers.authorization || '').replace('Bearer ', '').trim();
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = getToken(req);
  if (!verifyToken(token)) return res.status(401).json({ error: 'Brak autoryzacji' });

  const { filename, data } = req.body || {};
  if (!filename || !data) return res.status(400).json({ error: 'Brak pliku' });

  const repo = process.env.GITHUB_REPO;
  const ghToken = process.env.GITHUB_TOKEN;
  if (!repo || !ghToken) return res.status(500).json({ error: 'GitHub nie skonfigurowany' });

  const safe = sanitizeFilename(filename);
  const path = `uploads/${safe}`;
  const branch = process.env.GITHUB_BRANCH || 'main';

  // Check if file exists (to get SHA for update)
  let sha;
  try {
    const existing = await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}`,
      { headers: { Authorization: `Bearer ${ghToken}`, 'User-Agent': 'EPD-Admin/1.0' } }
    );
    if (existing.ok) {
      const d = await existing.json();
      sha = d.sha;
    }
  } catch {}

  const body = { message: `Admin: upload ${safe}`, content: data, branch };
  if (sha) body.sha = sha;

  const putRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ghToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'EPD-Admin/1.0'
      },
      body: JSON.stringify(body)
    }
  );

  if (!putRes.ok) {
    const err = await putRes.text();
    return res.status(500).json({ error: `GitHub upload error: ${err}` });
  }

  return res.json({ path, url: `/${path}` });
};
