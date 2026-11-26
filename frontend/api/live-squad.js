// Aktueller Kader (inkl. Auswechselspieler) EINES Managers aus der Kickbase-API
// (/v4/leagues/{leagueId}/managers/{userId}/squad) fuer den "Mein Kader"-Tab
// auf der Live-Seite. Nur 1 Kickbase-Call, 60s auf Vercel Edge gecacht.
import {
  API_BASE,
  loginAndFindLeague,
  getJson,
  setLiveCacheHeaders,
  sendRateLimitIfActive,
  isNumericId,
  isValidLeagueKey,
} from './_kickbaseClient.js';

function extractSquadArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    for (const key of ['it', 'pl', 'players', 'squad']) {
      if (Array.isArray(raw[key])) return raw[key];
    }
  }
  return [];
}

export default async function handler(req, res) {
  if (sendRateLimitIfActive(res)) return;

  const { userId, leagueKey } = req.query;
  if (!isNumericId(userId) || !isValidLeagueKey(leagueKey)) {
    return res.status(400).json({ error: 'Gueltige userId und leagueKey (L1/L2/L3) sind erforderlich' });
  }

  const auth = await loginAndFindLeague(leagueKey);
  if (sendRateLimitIfActive(res)) return;
  if (!auth) {
    return res.status(502).json({ error: 'Login bei Kickbase fehlgeschlagen oder Liga nicht gefunden' });
  }
  const { token, leagueId } = auth;

  const raw = await getJson(
    `${API_BASE}/leagues/${leagueId}/managers/${userId}/squad`,
    token
  );
  if (sendRateLimitIfActive(res)) return;
  if (!raw) {
    return res.status(502).json({ error: 'Kader konnte nicht geladen werden' });
  }

  const players = extractSquadArray(raw)
    .map((p) => {
      const id = p.pi ?? p.i ?? p.id;
      if (id == null) return null;
      return {
        playerId: String(id),
        firstName: p.fn || null,
        name: p.pn || p.ln || p.n || null,
        position: typeof p.pos === 'number' ? p.pos : null,
        teamId: p.tid != null ? String(p.tid) : null,
        marketValue: typeof p.mv === 'number' ? p.mv : null,
        mvTrendAmount: typeof p.tfhmvt === 'number' ? p.tfhmvt : null,
        mvTrendDir: typeof p.mvt === 'number' ? p.mvt : null,
        status: typeof p.st === 'number' ? p.st : null,
        prob: typeof p.prob === 'number' ? p.prob : null,
        points: typeof p.p === 'number' ? p.p : null,
        avgPoints: typeof p.ap === 'number' ? p.ap : null,
        imagePath: p.pim || null,
        lineupOrder: typeof p.lo === 'number' ? p.lo : null,
      };
    })
    .filter(Boolean);

  setLiveCacheHeaders(res, { maxAge: 60, staleWhileRevalidate: 60 });
  return res.status(200).json({ players });
}
