// Teamliste je Wettbewerb fuer den "Echte Teams"-Umschalter auf der
// Live-Seite (Owner-Wunsch 24.11.2026) - /v4/base/predictions/teams/{id}
// liefert Name + Wappen (SVG) OHNE Liga-Kontext, reicht fuer eine simple
// Auswahlliste. Wird NUR beim Oeffnen des "Echte Teams"-Umschalters
// abgerufen, kein Hintergrund-Polling.
import { API_BASE, getJson, loginAny } from './_kickbaseClient.js';

export default async function handler(req, res) {
  const { competitionId = '1' } = req.query;

  const token = await loginAny();
  if (!token) {
    return res.status(502).json({ error: 'Login bei Kickbase fehlgeschlagen' });
  }

  const data = await getJson(`${API_BASE}/base/predictions/teams/${competitionId}`, token);
  const teams = (data?.tms || [])
    .map((t) => ({
      id: t.tid,
      name: t.tn,
      logo: t.tim ? `https://kickbase.b-cdn.net/${t.tim}` : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return res.status(200).json({ teams });
}
