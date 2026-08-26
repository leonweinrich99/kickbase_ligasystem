// Loest den "Kickbase Trading Advisor"-Workflow aus (siehe
// .github/workflows/advisor.yml). Nutzt bewusst dieselben, bereits
// hinterlegten Secrets/Variablen wie /api/cron.js (CRON_SECRET,
// GITHUB_TOKEN) - keine neue Konfiguration noetig.
/* global process */

export default async function handler(req, res) {
  // Nur per Authorization-Header, kein Query-Parameter mehr (siehe cron.js).
  const authHeader = req.headers['authorization'];

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const githubRes = await fetch(
      'https://api.github.com/repos/leonweinrich99/kickbase_ligasystem/actions/workflows/advisor.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Vercel-Cron-Job'
        },
        body: JSON.stringify({ ref: 'main' })
      }
    );

    if (githubRes.status === 204) {
      return res.status(200).json({ success: true, message: 'Trading-Advisor-Workflow gestartet' });
    }

    const errorText = await githubRes.text();
    console.error('GitHub API Error:', errorText);
    return res.status(githubRes.status).json({ error: errorText });
  } catch (error) {
    console.error('Server Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
