const crypto = require('crypto');

function verifySession(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)epd_session=([^;]+)/);
  const token = m ? decodeURIComponent(m[1]) : '';
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [id, expires, sig] = parts;
    if (Date.now() > parseInt(expires, 10)) return false;
    const secret = process.env.JWT_SECRET;
    if (!secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${id}.${expires}`).digest('hex');
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

function ghHeaders() {
  return {
    Authorization: `token ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'EPD-Admin/1.0'
  };
}

const repo   = () => process.env.GITHUB_REPO   || 'Thashar/EPDesign';
const branch = () => process.env.GITHUB_BRANCH || 'main';

module.exports = async function handler(req, res) {
  if (!verifySession(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (!process.env.GITHUB_TOKEN) {
    return res.status(503).json({ error: 'GitHub nie jest skonfigurowany (brak GITHUB_TOKEN w .env)' });
  }

  const urlObj = new URL(req.url, 'http://localhost');

  // ── GET ?action=commits ────────────────────────────────────────────────────
  if (req.method === 'GET' && urlObj.searchParams.get('action') === 'commits') {
    try {
      const r = await fetch(
        `https://api.github.com/repos/${repo()}/commits?sha=${branch()}&per_page=5`,
        { headers: ghHeaders() }
      );
      if (!r.ok) {
        const txt = await r.text();
        console.error('[github] commits error:', txt);
        return res.status(502).json({ error: 'Błąd GitHub API: ' + r.status });
      }
      const commits = await r.json();
      return res.json({
        commits: commits.map(c => ({
          sha:     c.sha,
          short:   c.sha.slice(0, 7),
          message: c.commit.message.split('\n')[0].slice(0, 80),
          date:    c.commit.author.date,
          author:  c.commit.author.name
        }))
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST restore ───────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { sha } = req.body || {};
    if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) {
      return res.status(400).json({ error: 'Nieprawidłowy SHA commitu' });
    }

    try {
      async function getFileAtRef(path, ref) {
        const r = await fetch(
          `https://api.github.com/repos/${repo()}/contents/${encodeURIComponent(path)}?ref=${ref}`,
          { headers: ghHeaders() }
        );
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`GitHub ${r.status} dla ${path}`);
        return r.json();
      }

      function extractUploadPaths(obj, found = new Set()) {
        if (!obj || typeof obj !== 'object') return found;
        if (Array.isArray(obj)) { obj.forEach(item => extractUploadPaths(item, found)); return found; }
        for (const [key, val] of Object.entries(obj)) {
          if ((key === 'photo' || key === 'image') && typeof val === 'string' && val.startsWith('uploads/')) {
            found.add(val);
          } else {
            extractUploadPaths(val, found);
          }
        }
        return found;
      }

      // 1. Pobierz content.json i content-en.json z docelowego SHA
      const [plFile, enFile] = await Promise.all([
        getFileAtRef('content.json',    sha),
        getFileAtRef('content-en.json', sha)
      ]);
      if (!plFile || !enFile) {
        return res.status(404).json({ error: 'content.json lub content-en.json nie istnieje w tym commicie' });
      }

      // 2. Wyodrębnij ścieżki zdjęć z obu plików
      const decode = f => JSON.parse(Buffer.from(f.content, 'base64').toString('utf-8').replace(/^﻿/, ''));
      const photoPaths = new Set([
        ...extractUploadPaths(decode(plFile)),
        ...extractUploadPaths(decode(enFile))
      ]);

      // 3. Pobierz zdjęcia z docelowego SHA (równolegle)
      const photoEntries = await Promise.all(
        [...photoPaths].map(async p => {
          const f = await getFileAtRef(p, sha);
          return f ? { path: p, blobSha: f.sha } : null;
        })
      );
      const photos = photoEntries.filter(Boolean);

      // 4. Pobierz aktualny HEAD commita i SHA drzewa
      const refR = await fetch(
        `https://api.github.com/repos/${repo()}/git/refs/heads/${branch()}`,
        { headers: ghHeaders() }
      );
      if (!refR.ok) throw new Error('Nie można pobrać HEAD ref');
      const currentCommitSha = (await refR.json()).object.sha;

      const commitR = await fetch(
        `https://api.github.com/repos/${repo()}/git/commits/${currentCommitSha}`,
        { headers: ghHeaders() }
      );
      if (!commitR.ok) throw new Error('Nie można pobrać aktualnego commitu');
      const currentTreeSha = (await commitR.json()).tree.sha;

      // 5. Zbuduj nowe drzewo na bazie aktualnego — tylko zmienione pliki
      const treeItems = [
        { path: 'content.json',    mode: '100644', type: 'blob', sha: plFile.sha },
        { path: 'content-en.json', mode: '100644', type: 'blob', sha: enFile.sha },
        ...photos.map(f => ({ path: f.path, mode: '100644', type: 'blob', sha: f.blobSha }))
      ];

      const treeR = await fetch(
        `https://api.github.com/repos/${repo()}/git/trees`,
        {
          method: 'POST',
          headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ base_tree: currentTreeSha, tree: treeItems })
        }
      );
      if (!treeR.ok) throw new Error(`Błąd tworzenia tree: ${(await treeR.text()).slice(0, 120)}`);
      const newTreeSha = (await treeR.json()).sha;

      // 6. Utwórz commit
      const n = photos.length;
      const photoNote = n > 0 ? ` + ${n} ${n === 1 ? 'zdjęcie' : n < 5 ? 'zdjęcia' : 'zdjęć'}` : '';
      const newCommitR = await fetch(
        `https://api.github.com/repos/${repo()}/git/commits`,
        {
          method: 'POST',
          headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Przywrócono treść${photoNote} z commitu ${sha.slice(0, 7)}`,
            tree:    newTreeSha,
            parents: [currentCommitSha]
          })
        }
      );
      if (!newCommitR.ok) throw new Error(`Błąd tworzenia commitu: ${(await newCommitR.text()).slice(0, 120)}`);
      const newCommitSha = (await newCommitR.json()).sha;

      // 7. Przesuń wskaźnik gałęzi
      const updateR = await fetch(
        `https://api.github.com/repos/${repo()}/git/refs/heads/${branch()}`,
        {
          method: 'PATCH',
          headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ sha: newCommitSha })
        }
      );
      if (!updateR.ok) throw new Error(`Błąd aktualizacji ref: ${(await updateR.text()).slice(0, 120)}`);

      return res.json({ success: true, photos: n });
    } catch (e) {
      console.error('[github] restore error:', e.message);
      return res.status(502).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
