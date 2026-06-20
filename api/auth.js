const crypto = require('crypto');

// In-memory rate limiter: max 5 prób / 60s per IP
const attempts = new Map();
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  attempts.forEach((ts, ip) => {
    const fresh = ts.filter(t => t > cutoff);
    if (fresh.length === 0) attempts.delete(ip);
    else attempts.set(ip, fresh);
  });
}, 60_000);

function isRateLimited(ip) {
  const now = Date.now();
  const cutoff = now - 60_000;
  const ts = (attempts.get(ip) || []).filter(t => t > cutoff);
  ts.push(now);
  attempts.set(ip, ts);
  return ts.length > 5;
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
  // Brak CORS — auth działa tylko same-origin
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const ip = getIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Zbyt wiele prób. Spróbuj za chwilę.' });
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

  const token = generateToken(secret);
  return res.json({ token });
};
