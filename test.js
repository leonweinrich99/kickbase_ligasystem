const fetch = require('node-fetch');

async function test() {
  try {
    const loginRes = await fetch('https://api.kickbase.com/v4/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'weinrich99@gmail.com', password: 'fifxe0-Puztuv-wawmen' })
    });
    const loginData = await loginRes.json();
    console.log("Login data:", JSON.stringify(loginData, null, 2).slice(0, 500));
    const token = loginData.token || loginData.tkn;
    if (!token) {
        console.log("No token found");
        return;
    }
    const leagueRes = await fetch('https://api.kickbase.com/v4/leagues', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const leagueData = await leagueRes.json();
    console.log("Leagues:", JSON.stringify(leagueData, null, 2).slice(0, 500));
  } catch (err) {
    console.error(err);
  }
}
test();
