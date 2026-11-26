// Gemeinsame Zeitsteuerung fuer Liga-Tab (Gesamt vs. Spieltag) und Live-Tab
// (Mein Kader vs. Live) auf Basis der deutschen Ortszeit (Europe/Berlin):
//   - Wochen-Fenster (Di 00:00 – Fr 17:59): Liga -> Gesamt, Live -> Mein Kader
//   - Spieltags-Fenster (Fr 18:00 – Mo 23:59): Liga -> Spieltag, Live -> Live

export function getBerlinClockParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    weekday: get('weekday'), // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour') ?? 0),
    minute: Number(get('minute') ?? 0),
  };
}

/**
 * true  = Freitag 18:00 Uhr bis einschl. Montag 23:59 Uhr (Europe/Berlin)
 * false = Dienstag 00:00 Uhr bis Freitag 17:59 Uhr (Europe/Berlin)
 */
export function isMatchdayWindowBerlin(now = new Date()) {
  const { weekday, hour } = getBerlinClockParts(now);
  if (weekday === 'Sat' || weekday === 'Sun' || weekday === 'Mon') return true;
  if (weekday === 'Fri' && hour >= 18) return true;
  return false;
}
