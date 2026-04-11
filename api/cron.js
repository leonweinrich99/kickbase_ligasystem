export default async function handler(req, res) {
  // Sicherheitscheck: Vergleicht das Secret von Vercel mit dem Authorization Header
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  //comment
  try {
    console.log("Triggering GitHub Action...");
    const githubRes = await fetch(
      'https://api.github.com/repos/leonweinrich99/kickbase_ligasystem/actions/workflows/update-data.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Vercel-Cron-Job'
        },
        body: JSON.stringify({
          ref: 'main'
        })
      }
    );

    if (githubRes.status === 204) {
      return res.status(200).json({ success: true, message: "Workflow triggered successfully" });
    } else {
      const errorText = await githubRes.text();
      console.error("GitHub API Error:", errorText);
      return res.status(githubRes.status).json({ error: errorText });
    }
  } catch (error) {
    console.error("Server Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
