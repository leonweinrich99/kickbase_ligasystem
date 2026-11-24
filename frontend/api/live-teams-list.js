// Teamliste je Wettbewerb fuer den "Echte Teams"-Umschalter auf der
// Live-Seite (Owner-Wunsch 24.11.2026) - /v4/base/predictions/teams/{id}
// liefert Name + Wappen (SVG) OHNE Liga-Kontext. 1h auf Vercel Edge gecacht.
import { API_BASE, getJson, loginAny, setLiveCacheHeaders, sendRateLimitIfActive } from './_kickbaseClient.js';

export default async function handler(req, res) {
  if (sendRateLimitIfActive(res)) return;

  const { competitionId = '1' } = req.query;

  const token = await loginAny();
  if (sendRateLimitIfActive(res)) return;
  if (!token) {
    return res.status(502).json({ error: 'Login bei Kickbase fehlgeschlagen' });
  }

  const data = await getJson(`${API_BASE}/base/predictions/teams/${competitionId}`, token);
  if (sendRateLimitIfActive(res)) return;

  const teams = (data?.tms || [])
    .map((t) => ({
      id: t.tid,
      name: t.tn,
      logo: t.tim ? `https://kickbase.b-cdn.net/${t.tim}` : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  setLiveCacheHeaders(res, { maxAge: 3600, staleWhileRevalidate: 86400 });
  return res.status(200).json({ teams });
}
