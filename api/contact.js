function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Rate limiting ─────────────────────────────────────────────────────────────
//
// Zasady:
//  - max 2 wiadomości na 15 min z jednego IP
//  - jeśli kolejne naruszenie nastąpi w ciągu 1 h od poprzedniej blokady → czas blokady x2
//  - eskalacja nie ma górnego limitu (15m → 30m → 1h → 2h → 4h → ...)
//  - brak naruszeń przez 1 h od ostatniej blokady → reset do 15 min
//
const ipState = new Map();
const BASE_DURATION  = 15 * 60 * 1000;  // 15 min
const ESCALATION_WIN = 60 * 60 * 1000;  // 1 h — okno eskalacji
const MAX_MSGS       = 2;

function getState(ip) {
  if (!ipState.has(ip)) {
    ipState.set(ip, { msgs: [], blockUntil: 0, blockDuration: BASE_DURATION, lastBlock: 0 });
  }
  return ipState.get(ip);
}

function checkRateLimit(ip) {
  const now = Date.now();
  const s   = getState(ip);

  // IP jest aktualnie zablokowane
  if (now < s.blockUntil) {
    return { blocked: true, retryAfter: Math.ceil((s.blockUntil - now) / 1000) };
  }

  // Usuń wiadomości starsze niż 15 min (bazowe okno zliczania)
  s.msgs = s.msgs.filter(t => now - t < BASE_DURATION);

  if (s.msgs.length >= MAX_MSGS) {
    // Eskalacja: jeśli ostatnia blokada była w ciągu 1 h → podwój czas blokady
    if (s.lastBlock > 0 && now - s.lastBlock < ESCALATION_WIN) {
      s.blockDuration *= 2;
    } else {
      s.blockDuration = BASE_DURATION;  // reset do bazowego po spokojnej godzinie
    }
    s.blockUntil = now + s.blockDuration;
    s.lastBlock  = now;
    s.msgs       = [];
    return { blocked: true, retryAfter: Math.ceil(s.blockDuration / 1000) };
  }

  return { blocked: false };
}

function recordMsg(ip) {
  getState(ip).msgs.push(Date.now());
}

function formatWait(seconds, isEn) {
  if (seconds < 3600) {
    const mins = Math.ceil(seconds / 60);
    return isEn ? `${mins} min` : `${mins} min`;
  }
  const hours = Math.ceil(seconds / 3600);
  return isEn ? `${hours} h` : `${hours} h`;
}

// Czyszczenie wpisów starszych niż 48 h (ochrona przed wyciekiem pamięci)
setInterval(() => {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  for (const [ip, s] of ipState) {
    if (s.blockUntil < cutoff && s.lastBlock < cutoff) ipState.delete(ip);
  }
}, 60 * 60 * 1000);

function getIP(req) {
  const xff = req.headers['x-forwarded-for'];
  return (xff ? xff.split(',')[0] : req.socket?.remoteAddress || 'unknown').trim();
}

// ─── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_ORIGIN || 'https://ep-design.pl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const ip = getIP(req);
  const rl = checkRateLimit(ip);

  if (rl.blocked) {
    const isEnRl = (req.body || {}).lang === 'en';
    const wait   = formatWait(rl.retryAfter, isEnRl);
    return res.status(429).json({
      error: isEnRl
        ? `Too many messages. Please try again in ${wait}.`
        : `Zbyt wiele wiadomości. Spróbuj ponownie za ${wait}.`,
      retryAfter: rl.retryAfter
    });
  }

  const { name, company, email, phone, subject, message, consent, lang } = req.body || {};
  const isEn = lang === 'en';

  if (!name || !email || !message) {
    return res.status(400).json({ error: isEn ? 'Missing required fields' : 'Brak wymaganych pól' });
  }
  if (!consent) {
    return res.status(400).json({ error: isEn ? 'GDPR consent is required' : 'Wymagana zgoda na przetwarzanie danych' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: isEn ? 'Invalid e-mail address' : 'Nieprawidłowy adres e-mail' });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.error('[contact] RESEND_API_KEY not set');
    return res.status(500).json({ error: isEn ? 'Server configuration error' : 'Błąd konfiguracji serwera' });
  }

  // Zalicz wiadomość do limitu dopiero po przejściu wszystkich walidacji
  recordMsg(ip);

  const to          = process.env.CONTACT_EMAIL || 'kontakt@ep-design.pl';
  const from        = process.env.CONTACT_FROM  || 'EPDesign Formularz <formularz@ep-design.pl>';
  const subjectLine = `[EPDesign] ${subject || (isEn ? 'New inquiry' : 'Nowe zapytanie')} — ${name}`;

  const text = [
    isEn ? 'New inquiry via ep-design.pl' : 'Nowe zapytanie ze strony ep-design.pl',
    '',
    `${isEn ? 'Name'    : 'Imię i Nazwisko'}: ${name}`,
    `${isEn ? 'Company' : 'Firma'}:           ${company || '—'}`,
    `E-mail:                                   ${email}`,
    `${isEn ? 'Phone'   : 'Telefon'}:          ${phone || '—'}`,
    `${isEn ? 'Subject' : 'Przedmiot'}:        ${subject || '—'}`,
    '',
    isEn ? 'Message:' : 'Wiadomość:',
    message,
    '',
    'RODO / GDPR: ' + (isEn ? 'consent granted' : 'zgoda udzielona')
  ].join('\n');

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#0d2135;max-width:600px;margin:0 auto;padding:24px">
<h2 style="color:#2fb6d6;margin-bottom:20px">${isEn ? 'New inquiry via ep-design.pl' : 'Nowe zapytanie ze strony ep-design.pl'}</h2>
<table style="border-collapse:collapse;width:100%;margin-bottom:24px">
  <tr><td style="padding:8px 0;border-bottom:1px solid #e0e8f0;color:#7f9bb0;width:160px;vertical-align:top">${isEn ? 'Name' : 'Imię i Nazwisko'}</td><td style="padding:8px 0;border-bottom:1px solid #e0e8f0"><strong>${esc(name)}</strong></td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #e0e8f0;color:#7f9bb0;vertical-align:top">${isEn ? 'Company' : 'Firma'}</td><td style="padding:8px 0;border-bottom:1px solid #e0e8f0">${esc(company || '—')}</td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #e0e8f0;color:#7f9bb0;vertical-align:top">E-mail</td><td style="padding:8px 0;border-bottom:1px solid #e0e8f0"><a href="mailto:${esc(email)}" style="color:#2fb6d6">${esc(email)}</a></td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #e0e8f0;color:#7f9bb0;vertical-align:top">${isEn ? 'Phone' : 'Telefon'}</td><td style="padding:8px 0;border-bottom:1px solid #e0e8f0">${esc(phone || '—')}</td></tr>
  <tr><td style="padding:8px 0;color:#7f9bb0;vertical-align:top">${isEn ? 'Subject' : 'Przedmiot'}</td><td style="padding:8px 0">${esc(subject || '—')}</td></tr>
</table>
<h3 style="margin-bottom:10px">${isEn ? 'Message' : 'Wiadomość'}</h3>
<div style="white-space:pre-wrap;background:#f0f4f8;padding:16px;border-radius:4px;line-height:1.6">${esc(message)}</div>
<p style="font-size:12px;color:#7f9bb0;margin-top:24px;border-top:1px solid #e0e8f0;padding-top:12px">RODO / GDPR: ${isEn ? 'consent granted' : 'zgoda udzielona'}</p>
</body></html>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], reply_to: email, subject: subjectLine, text, html })
    });

    if (!r.ok) {
      const errBody = await r.text();
      console.error('[contact] Resend error:', errBody);
      return res.status(502).json({ error: isEn ? 'Failed to send message' : 'Błąd wysyłania wiadomości' });
    }

    return res.json({ success: true });
  } catch (e) {
    console.error('[contact] error:', e.message);
    return res.status(500).json({ error: isEn ? 'Server error' : 'Błąd serwera' });
  }
};
