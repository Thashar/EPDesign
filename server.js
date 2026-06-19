/**
 * EPD Local Dev Server
 * Uruchom: node server.js
 * Wymaga: Node 18+ (wbudowany fetch)
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

// ─── Wczytaj .env (bez npm) ─────────────────────────────────────────────────
function loadEnv() {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf-8').split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx < 0) return;
    const key = line.slice(0, idx).trim();
    let val   = line.slice(idx + 1).trim();
    val = val.replace(/^(['"])(.*)\1$/, '$2'); // strip quotes
    if (key && !(key in process.env)) process.env[key] = val;
  });
}
loadEnv();

// ─── MIME types ──────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
  '.pdf':  'application/pdf',
};

// ─── Odczyt body ─────────────────────────────────────────────────────────────
function readBody(req) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', chunk => buf += chunk);
    req.on('end',  () => resolve(buf));
    req.on('error', reject);
  });
}

// ─── Lokalne fallbacki gdy brak GitHub ──────────────────────────────────────
function localContentGet(res) {
  const file = path.join(__dirname, 'content.json');
  if (!fs.existsSync(file)) return res.status(500).json({ error: 'Brak content.json' });
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return res.json(data);
}

function localContentPost(body, res) {
  const file = path.join(__dirname, 'content.json');
  fs.writeFileSync(file, JSON.stringify(body, null, 2), 'utf-8');
  console.log('  [content] Zapisano content.json lokalnie');
  return res.json({ success: true });
}

function localUpload(body, res) {
  const { filename, data } = body || {};
  if (!filename || !data) return res.status(400).json({ error: 'Brak pliku' });
  const safe = filename.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').slice(0, 64);
  const dest = path.join(__dirname, 'uploads', safe);
  fs.writeFileSync(dest, Buffer.from(data, 'base64'));
  console.log(`  [upload] Zapisano lokalnie: uploads/${safe}`);
  return res.json({ path: `uploads/${safe}`, url: `/uploads/${safe}` });
}

// ─── Patchowanie handlerów API gdy brak GitHub ──────────────────────────────
function patchForLocal(handlerPath, rawReq, body, mockRes) {
  const name = path.basename(handlerPath, '.js');

  if (name === 'content' && !process.env.GITHUB_TOKEN) {
    // Sprawdź token normalnie przez oryginalne api, ale zamiast GitHub — plik
    // Łatwiej: sprawdź metodę i obsłuż lokalnie
    if (rawReq.method === 'GET') {
      return localContentGet(mockRes);
    }
    if (rawReq.method === 'POST') {
      // Weryfikacja tokenu przez oryginalny handler jest zbędna lokalnie
      return localContentPost(body, mockRes);
    }
  }

  if (name === 'upload' && !process.env.GITHUB_TOKEN) {
    return localUpload(body, mockRes);
  }

  return null; // nie patchowane — użyj oryginalnego handlera
}

// ─── Serwer ──────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const urlObj   = new URL(req.url, 'http://localhost');
  const pathname = urlObj.pathname;

  // ── API routes (/api/*) ──────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const name        = pathname.slice(5).replace(/\/$/, '');
    const handlerPath = path.join(__dirname, 'api', `${name}.js`);

    if (!fs.existsSync(handlerPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `Nie znaleziono API: /api/${name}` }));
    }

    const rawBody = await readBody(req);
    let parsed = {};
    if (rawBody) { try { parsed = JSON.parse(rawBody); } catch {} }
    req.body = parsed;

    // Mock res (pasuje do interfejsu Vercel)
    let sent = false;
    const mockRes = {
      _status: 200,
      _headers: {},
      setHeader(k, v) { this._headers[k] = v; },
      getHeader(k)    { return this._headers[k]; },
      status(code)    { this._status = code; return this; },
      json(data) {
        if (sent) return; sent = true;
        const body = JSON.stringify(data);
        res.writeHead(this._status, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...this._headers
        });
        res.end(body);
      },
      end(data) {
        if (sent) return; sent = true;
        res.writeHead(this._status, this._headers);
        res.end(data || '');
      }
    };

    // Lokalne fallbacki gdy brak GITHUB_TOKEN
    const patched = patchForLocal(handlerPath, req, parsed, mockRes);
    if (patched !== null) return;

    try {
      delete require.cache[require.resolve(handlerPath)];
      const handler = require(handlerPath);
      await handler(req, mockRes);
    } catch (e) {
      if (!sent) {
        console.error(`  [api/${name}] Błąd:`, e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    }
    return;
  }

  // ── Pliki statyczne ──────────────────────────────────────────────────────
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, decodeURIComponent(filePath));

  // Zabezpieczenie przed traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — Nie znaleziono: ' + pathname);
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);

server.listen(PORT, () => {
  const noGithub = !process.env.GITHUB_TOKEN;
  console.log('');
  console.log('  ╔════════════════════════════════════════════╗');
  console.log('  ║  EPD Dev Server                            ║');
  console.log('  ╚════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Strona główna:  http://localhost:${PORT}/`);
  console.log(`  Panel logowania: http://localhost:${PORT}/admin.html`);
  console.log(`  Panel admina:   http://localhost:${PORT}/admin-panel.html`);
  console.log('');
  if (noGithub) {
    console.log('  ⚠  GITHUB_TOKEN pusty → zapis/odczyt lokalnie z content.json');
    console.log('     Zdjęcia zapisywane do uploads/ na dysku');
    console.log('');
  }
  console.log(`  Hasło: ${process.env.ADMIN_PASSWORD || '(ADMIN_PASSWORD nie ustawione)'}`);
  console.log('');
  console.log('  Ctrl+C — zatrzymaj');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} jest zajęty. Zmień PORT= w .env\n`);
  } else {
    console.error('\n  Błąd serwera:', err.message, '\n');
  }
  process.exit(1);
});
