require('dotenv').config();
const { getConfiguredKickbaseAccounts } = require('./kickbase');

async function run() {
  const accounts = getConfiguredKickbaseAccounts();
  const account = accounts[0];
  const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ em: account.email, loy: false, pass: account.pass, rep: {} })
  });
  const loginData = await loginRes.json();
  const token = loginData.tkn;

  const leaguesRes = await fetch('https://api.kickbase.com/v4/leagues', { headers: { Authorization: `Bearer ${token}` } });
  const leaguesData = await leaguesRes.json();
  const leagueId = (leaguesData.it || leaguesData.leagues || [])[0].i || (leaguesData.it || leaguesData.leagues || [])[0].id;
  console.log('League:', leagueId);

  // Test 1: ranking with day
  const rRes = await fetch(`https://api.kickbase.com/v4/leagues/${leagueId}/ranking?day=1`, { headers: { Authorization: `Bearer ${token}` } });
  const rData = await rRes.json();
  console.log('Ranking keys:', Object.keys(rData));
  if (rData.us && rData.us.length > 0) {
      console.log('Ranking User 0 keys:', Object.keys(rData.us[0]));
      console.log('Has lineup?', !!rData.us[0].lp);
  }
}
run();
