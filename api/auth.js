const crypto = require('crypto');

function generateToken(secret) {
  const id = crypto.randomBytes(16).toString('hex');
  const expires = Date.now() + 86400000; // 24h
  const payload = `${id}.${expires}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
  }

  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: 'Nieprawidłowe hasło' });
  }

  const secret = process.env.JWT_SECRET || 'changeme-set-jwt-secret-env-var';
  const token = generateToken(secret);
  return res.json({ token });
};
