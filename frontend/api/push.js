// Zentraler Push-Router (1 einzige Vercel Serverless Function fuer alle 9
// Push-Endpunkte -> haelt die App mit 9/12 Funktionen sicher unter dem
// Vercel-Hobby-Limit von 12 Serverless Functions!).
// Die bisherigen URLs (/api/push-test, /api/notify-articles, /api/live-event-push,
// /api/squad-reminder, /api/pokal-reminder, /api/notify-admins, /api/admin-broadcast
// usw.) werden transparent ueber frontend/vercel.json auf `/api/push?action=...`
// umgeschrieben.
import {
  handleAdminBroadcast,
  handleCommentMention,
  handleNotifyAdmins,
  handlePushTest,
} from './_pushAdmin.js';
import {
  handleNotifyArticles,
  handleNotifyPokalResults,
  handleNotifyRatingChanges,
  handlePokalReminder,
} from './_pushScheduled.js';
import handleSquadAlert from './_pushSquadAlert.js';
import handleLiveEventPush from './_pushLiveEvents.js';

export default async function handler(req, res) {
  const action = String(req.query?.action || req.body?.action || '').trim();

  switch (action) {
    case 'test':
      return handlePushTest(req, res);
    case 'notify-admins':
      return handleNotifyAdmins(req, res);
    case 'admin-broadcast':
      return handleAdminBroadcast(req, res);
    case 'comment-mention':
      return handleCommentMention(req, res);
    case 'articles':
      return handleNotifyArticles(req, res);
    case 'rating':
      return handleNotifyRatingChanges(req, res);
    case 'pokal-reminder':
      return handlePokalReminder(req, res);
    case 'pokal-results':
      return handleNotifyPokalResults(req, res);
    case 'squad-reminder':
      return handleSquadAlert(req, res);
    case 'live-events':
      return handleLiveEventPush(req, res);
    default:
      return res.status(400).json({ error: `Unbekannte Push-Aktion: "${action}"` });
  }
}
