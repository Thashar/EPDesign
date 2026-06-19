const crypto = require('crypto');

function verifyToken(token) {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [id, expires, sig] = parts;
    if (Date.now() > parseInt(expires, 10)) return false;
    const secret = process.env.JWT_SECRET || 'changeme-set-jwt-secret-env-var';
    const payload = `${id}.${expires}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

async function githubRequest(path, options = {}) {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('GITHUB_REPO / GITHUB_TOKEN not configured');

  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'EPD-Admin/1.0',
      ...(options.headers || {})
    }
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`GitHub ${res.status}: ${body}`);
  }
  return res.status === 404 ? null : res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — public, anyone can read
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    try {
      const file = await githubRequest('content.json');
      if (!file) return res.json({});
      const content = JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8'));
      return res.json(content);
    } catch (e) {
      console.error('GET content error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — protected write
  if (req.method === 'POST') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!verifyToken(token)) {
      return res.status(401).json({ error: 'Brak autoryzacji' });
    }

    try {
      const file = await githubRequest('content.json');
      const sha = file?.sha;
      const branch = process.env.GITHUB_BRANCH || 'main';

      const newContent = JSON.stringify(req.body, null, 2);
      const encoded = Buffer.from(newContent, 'utf-8').toString('base64');

      await githubRequest('content.json', {
        method: 'PUT',
        body: JSON.stringify({
          message: 'Admin: aktualizacja treści strony',
          content: encoded,
          sha,
          branch
        })
      });

      return res.json({ success: true });
    } catch (e) {
      console.error('POST content error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
};
