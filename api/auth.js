const crypto = require('crypto');

// { ip -> { attempts: number[], lockedUntil: number, windowMs: number } }
const state = new Map();

setInterval(() => {
  const now = Date.now();
  state.forEach((s, ip) => {
    if (s.lockedUntil <= now && s.attempts.length === 0) state.delete(ip);
  });
}, 60_000);

const BASE_WINDOW = 60_000; // 60s
const MAX_ATTEMPTS = 5;

function checkRateLimit(ip) {
  const now = Date.now();
  let s = state.get(ip) || { attempts: [], lockedUntil: 0, windowMs: BASE_WINDOW };

  // Czy nadal zablokowany?
  if (s.lockedUntil > now) {
    return { limited: true, retryAfter: Math.ceil((s.lockedUntil - now) / 1000) };
  }

  // Wyczyść stare próby spoza aktualnego okna
  s.attempts = s.attempts.filter(t => t > now - s.windowMs);

  if (s.attempts.length >= MAX_ATTEMPTS) {
    // Podwój okno i zablokuj
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

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const ip = getIp(req);
  const { limited, retryAfter } = checkRateLimit(ip);
  if (limited) {
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      error: `Zbyt wiele prób. Spróbuj za ${retryAfter} s.`
    });
  }

  const { password } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'JWT_SECRET not configured' });
  }

  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: 'Nieprawidłowe hasło' });
  }

  // Udane logowanie — wyczyść historię prób dla tego IP
  state.delete(ip);

  const token = generateToken(secret);
  return res.json({ token });
};
