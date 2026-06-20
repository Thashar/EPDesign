function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_ORIGIN || 'https://epdesign.pl');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

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

  const to    = process.env.CONTACT_EMAIL || 'kontakt@epdesign.pl';
  const from  = process.env.CONTACT_FROM  || 'EPDesign Formularz <formularz@epdesign.pl>';
  const subjectLine = `[EPDesign] ${subject || (isEn ? 'New inquiry' : 'Nowe zapytanie')} — ${name}`;

  const text = [
    isEn ? 'New inquiry via epdesign.pl' : 'Nowe zapytanie ze strony epdesign.pl',
    '',
    `${isEn ? 'Name' : 'Imię i Nazwisko'}: ${name}`,
    `${isEn ? 'Company' : 'Firma'}: ${company || '—'}`,
    `E-mail: ${email}`,
    `${isEn ? 'Phone' : 'Telefon'}: ${phone || '—'}`,
    `${isEn ? 'Subject' : 'Przedmiot'}: ${subject || '—'}`,
    '',
    isEn ? 'Message:' : 'Wiadomość:',
    message,
    '',
    'RODO / GDPR: ' + (isEn ? 'consent granted' : 'zgoda udzielona')
  ].join('\n');

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#0d2135;max-width:600px;margin:0 auto;padding:24px">
<h2 style="color:#2fb6d6;margin-bottom:20px">${isEn ? 'New inquiry via epdesign.pl' : 'Nowe zapytanie ze strony epdesign.pl'}</h2>
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
