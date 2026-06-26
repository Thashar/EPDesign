const fs   = require('fs');
const path = require('path');
const { verifyToken, getToken } = require('./_auth');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlObj = new URL(req.url, 'http://localhost');
  const lang     = urlObj.searchParams.get('lang');
  const filename = lang === 'en' ? 'content-en.json' : 'content.json';

  const SECTION_LABELS = {
    hero:        'Strona główna',
    realizacje:  'Realizacje',
    uslugi:      'Usługi',
    ofirmie:     'O firmie',
    kadra:       'Kadra',
    certyfikaty: 'Certyfikaty',
    kontakt:     'Kontakt',
    privacy:     'Polityka prywatności',
    seo:         'SEO',
    settings:    'Ustawienia'
  };

  const rawSections = urlObj.searchParams.get('sections') || urlObj.searchParams.get('section') || '';
  const sectionList = rawSections.split(',').map(s => s.trim()).filter(Boolean);
  const labels      = sectionList.map(s => SECTION_LABELS[s]).filter(Boolean);

  const hasGithub = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
  const localFile = path.join(__dirname, '..', filename);

  // GET — public, anyone can read
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    try {
      if (hasGithub) {
        const file = await githubRequest(filename);
        if (!file) return res.json({});
        const raw = Buffer.from(file.content, 'base64').toString('utf-8').replace(/^﻿/, '');
        const content = JSON.parse(raw);
        return res.json(content);
      } else {
        // fallback: czytaj z pliku na dysku (lokalny dev / Vercel bez GitHub)
        if (!fs.existsSync(localFile)) return res.json({});
        const raw = fs.readFileSync(localFile, 'utf-8').replace(/^﻿/, '');
        const content = JSON.parse(raw);
        return res.json(content);
      }
    } catch (e) {
      console.error('GET content error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — protected write
  if (req.method === 'POST') {
    const token = getToken(req);
    if (!verifyToken(token)) {
      return res.status(401).json({ error: 'Brak autoryzacji' });
    }

    try {
      const newContent = JSON.stringify(req.body, null, 2);

      if (hasGithub) {
        const file = await githubRequest(filename);
        const sha = file?.sha;
        const branch = process.env.GITHUB_BRANCH || 'main';
        const labelStr  = labels.length > 0 ? labels.join(', ') : 'treść strony';
        const commitMsg = lang === 'en'
          ? `Admin: update — ${labelStr} (EN)`
          : `Admin: aktualizacja — ${labelStr}`;

        const encoded = Buffer.from(newContent, 'utf-8').toString('base64');
        await githubRequest(filename, {
          method: 'PUT',
          body: JSON.stringify({ message: commitMsg, content: encoded, sha, branch })
        });
      } else {
        // fallback: zapisz lokalnie na dysku
        fs.writeFileSync(localFile, newContent, 'utf-8');
        console.log(`[content] Zapisano lokalnie: ${filename}`);
      }

      return res.json({ success: true });
    } catch (e) {
      console.error('POST content error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
};
