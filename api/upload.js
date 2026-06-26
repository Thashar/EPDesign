const { verifyToken, getToken } = require('./_auth');

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']);

function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, 64);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = getToken(req);
  if (!verifyToken(token)) return res.status(401).json({ error: 'Brak autoryzacji' });

  const { filename, data } = req.body || {};
  if (!filename || !data) return res.status(400).json({ error: 'Brak pliku' });

  const safe = sanitizeFilename(filename);
  const dotIdx = safe.lastIndexOf('.');
  const ext = dotIdx >= 0 ? safe.slice(dotIdx) : '';
  if (!ALLOWED_EXT.has(ext)) {
    return res.status(400).json({ error: `Niedozwolony typ pliku. Dozwolone: ${[...ALLOWED_EXT].join(', ')}` });
  }

  const repo = process.env.GITHUB_REPO;
  const ghToken = process.env.GITHUB_TOKEN;
  if (!repo || !ghToken) return res.status(500).json({ error: 'GitHub nie skonfigurowany' });

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
