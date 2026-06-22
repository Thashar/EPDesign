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

    const files  = ['content.json', 'content-en.json'];
    const errors = [];

    for (const filename of files) {
      try {
        // Pobierz plik z docelowego commitu
        const rTarget = await fetch(
          `https://api.github.com/repos/${repo()}/contents/${filename}?ref=${sha}`,
          { headers: ghHeaders() }
        );
        if (!rTarget.ok) {
          errors.push(`${filename}: brak w commicie ${sha.slice(0, 7)}`);
          continue;
        }
        const targetFile = await rTarget.json();

        // Pobierz aktualny SHA pliku (wymagany przez GitHub API do PUT)
        const rCurrent = await fetch(
          `https://api.github.com/repos/${repo()}/contents/${filename}?ref=${branch()}`,
          { headers: ghHeaders() }
        );
        if (!rCurrent.ok) {
          errors.push(`${filename}: nie można pobrać aktualnej wersji`);
          continue;
        }
        const currentFile = await rCurrent.json();

        // Zapisz plik z treścią z docelowego commitu
        const rPut = await fetch(
          `https://api.github.com/repos/${repo()}/contents/${filename}`,
          {
            method: 'PUT',
            headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `Przywrócono ${filename} z commitu ${sha.slice(0, 7)}`,
              content: targetFile.content.replace(/\n/g, ''),
              sha:     currentFile.sha,
              branch:  branch()
            })
          }
        );
        if (!rPut.ok) {
          const errTxt = await rPut.text();
          errors.push(`${filename}: błąd zapisu (${errTxt.slice(0, 120)})`);
        }
      } catch (e) {
        errors.push(`${filename}: ${e.message}`);
      }
    }

    if (errors.length) return res.status(502).json({ error: errors.join(' | ') });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
