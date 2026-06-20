const crypto = require('crypto');

// { ip -> { attempts: number[], lockedUntil: number, windowMs: number } }
const state = new Map();

setInterval(() => {
  const now = Date.now();
  state.forEach((s, ip) => {
    if (s.lockedUntil <= now && s.attempts.length === 0) state.delete(ip);
  });
}, 60_000);

const BASE_WINDOW = 60_000;
const MAX_ATTEMPTS = 5;

function checkRateLimit(ip) {
  const now = Date.now();
  let s = state.get(ip) || { attempts: [], lockedUntil: 0, windowMs: BASE_WINDOW };

  if (s.lockedUntil > now) {
    return { limited: true, retryAfter: Math.ceil((s.lockedUntil - now) / 1000) };
  }

  s.attempts = s.attempts.filter(t => t > now - s.windowMs);

  if (s.attempts.length >= MAX_ATTEMPTS) {
    s.windowMs *= 2;
    s.lockedUntil = now + s.windowMs;
    s.attempts = [];
    state.set(ip, s);
    return { limited: true, retryAfter: Math.ceil(s.windowMs / 1000) };
  }

  s.attempts.push(now);
  state.set(ip, s);
  return { limited: false };
}

function getIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function generateToken(secret) {
  const id = crypto.randomBytes(16).toString('hex');
  const expires = Date.now() + 86400000; // 24h
  const payload = `${id}.${expires}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

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

function getSessionToken(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)epd_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: sprawdź czy bieżąca sesja jest aktywna
  if (req.method === 'GET') {
    const token = getSessionToken(req);
    if (verifyToken(token)) return res.json({ ok: true });
    return res.status(401).json({ ok: false });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const ip = getIp(req);
  const { limited, retryAfter } = checkRateLimit(ip);
  if (limited) {
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ error: `Zbyt wiele prób. Spróbuj za ${retryAfter} s.` });
  }

  const { password } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'JWT_SECRET not configured' });

  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: 'Nieprawidłowe hasło' });
  }

  state.delete(ip);

  const token = generateToken(secret);
  // HttpOnly — JS nie może odczytać ani ukraść tokenu
  res.setHeader('Set-Cookie',
    `epd_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`
  );
  return res.json({ ok: true });
};
