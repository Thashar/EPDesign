module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Usuń cookie sesji po stronie serwera
  res.setHeader('Set-Cookie',
    'epd_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
  );
  return res.json({ ok: true });
};
