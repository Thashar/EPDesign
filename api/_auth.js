const crypto = require('crypto');

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

// Akceptuje token z cookie lub nagłówka Authorization
function getToken(req) {
  const fromCookie = getSessionToken(req);
  if (fromCookie) return fromCookie;
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function verifySession(req) {
  return verifyToken(getSessionToken(req));
}

// Zwraca IP klienta. Preferuje x-epd-real-ip (ustawiany przez lokalny serwer dev),
// potem XFF (Vercel ustawia go po stronie infrastruktury).
function getClientIp(req) {
  if (req.headers['x-epd-real-ip']) return req.headers['x-epd-real-ip'];
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

module.exports = { verifyToken, getSessionToken, getToken, verifySession, getClientIp };
