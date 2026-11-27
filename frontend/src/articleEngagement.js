import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

export const ARTICLE_REACTIONS = [
  { id: 'fire', emoji: '🔥', label: 'Stark' },
  { id: 'clap', emoji: '👏', label: 'Respekt' },
  { id: 'laugh', emoji: '😂', label: 'Haha' },
  { id: 'mindblown', emoji: '🤯', label: 'Krass' },
  { id: 'heart', emoji: '❤️', label: 'Liebe' },
];

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Erkennt @-Erwaehnungen gegen alle bekannten Kickbase-Manager (auch mehrteilige
 * Namen wie "@Leon Weinrich" oder "@Stomping Tantrum") plus Fallback fuer
 * freie @Einzelwort-Namen.
 */
export function extractMentions(text, managers = []) {
  const raw = String(text || '');
  if (!raw.includes('@')) return { names: [], kickbaseIds: [] };

  const matchedNames = new Map(); // lower -> original display name
  const matchedIds = new Set();

  const sortedManagers = [...managers]
    .filter((m) => m?.name)
    .sort((a, b) => b.name.length - a.name.length);

  for (const m of sortedManagers) {
    const re = new RegExp(`(^|[\\s(])@${escapeRegex(m.name)}(?=$|[\\s.,!?:;)])`, 'i');
    if (re.test(raw)) {
      matchedNames.set(m.name.toLowerCase(), m.name);
      if (m.id != null) matchedIds.add(String(m.id));
    }
  }

  // Fallback fuer @Einzelwort (z.B. Vorname oder DisplayName ohne Leerzeichen)
  const wordRe = /(?:^|[\s(])@([A-Za-z0-9ÄÖÜäöüß_.-]{2,32})(?=$|[\s.,!?:;)])/g;
  let match;
  while ((match = wordRe.exec(raw)) !== null) {
    const token = match[1];
    const lower = token.toLowerCase();
    // Nicht doppelt anfuegen, wenn das Wort schon Teil eines erkannten Mehrwort-Namens ist
    const alreadyCovered = [...matchedNames.keys()].some(
      (full) => full === lower || full.startsWith(`${lower} `)
    );
    if (!alreadyCovered) {
      matchedNames.set(lower, token);
    }
  }

  return {
    names: [...matchedNames.values()].slice(0, 5),
    kickbaseIds: [...matchedIds].slice(0, 5),
  };
}

/**
 * Zerlegt einen Kommentartext in normale Text-Teile und hervorgehobene @Mentions.
 */
export function splitTextWithMentions(text, managers = []) {
  const raw = String(text || '');
  if (!raw.includes('@')) return [{ text: raw, isMention: false }];

  const managerNames = [...managers]
    .filter((m) => m?.name)
    .map((m) => escapeRegex(m.name))
    .sort((a, b) => b.length - a.length);

  const patternParts = [
    ...managerNames.map((n) => `@${n}`),
    '@[A-Za-z0-9ÄÖÜäöüß_.-]{2,32}',
  ];
  const re = new RegExp(`(${patternParts.join('|')})`, 'gi');

  const parts = [];
  let lastIndex = 0;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index;
    const prevChar = start > 0 ? raw[start - 1] : '';
    if (prevChar && !/[\s(]/.test(prevChar)) continue;

    if (start > lastIndex) {
      parts.push({ text: raw.slice(lastIndex, start), isMention: false });
    }
    parts.push({ text: m[0], isMention: true });
    lastIndex = start + m[0].length;
  }
  if (lastIndex < raw.length) {
    parts.push({ text: raw.slice(lastIndex), isMention: false });
  }
  return parts.length > 0 ? parts : [{ text: raw, isMention: false }];
}

export function formatRelativeTime(timestamp) {
  if (!timestamp) return 'gerade eben';
  const date = typeof timestamp?.toDate === 'function'
    ? timestamp.toDate()
    : timestamp instanceof Date
      ? timestamp
      : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 45) return 'gerade eben';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `vor ${diffHr} Std.`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'gestern';
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/**
 * Registriert einen eindeutigen Artikel-Aufruf fuer den eingeloggten Nutzer.
 * Einmal pro Browser-Session & Artikel (verhindert Mehrfach-Writes bei Re-Mounts).
 */
export async function recordArticleView({ slug, user, profile }) {
  if (!isFirebaseConfigured || !db || !slug || !user?.uid || profile?.status !== 'approved') return;

  const sessionKey = `kb_article_viewed_${slug}_${user.uid}`;
  try {
    if (window.sessionStorage.getItem(sessionKey) === '1') return;
    window.sessionStorage.setItem(sessionKey, '1');
  } catch {
    // sessionStorage kann im Private-Mode fehlschlagen
  }

  try {
    const viewRef = doc(db, 'articles', slug, 'views', user.uid);
    const articleRef = doc(db, 'articles', slug);
    const existing = await getDoc(viewRef);

    const displayName = profile.displayName || user.displayName || user.email || 'Unbekannt';
    const kickbaseName = profile.kickbaseName || displayName;

    if (!existing.exists()) {
      const batch = writeBatch(db);
      batch.set(viewRef, {
        uid: user.uid,
        displayName,
        kickbaseName,
        firstSeenAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        viewCount: 1,
        maxScrollPct: 0,
        readThrough: false,
      });
      batch.set(
        articleRef,
        {
          slug,
          viewsCount: increment(1),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await batch.commit();
    } else {
      await setDoc(
        viewRef,
        {
          displayName,
          kickbaseName,
          lastSeenAt: serverTimestamp(),
          viewCount: increment(1),
        },
        { merge: true }
      );
    }
  } catch {
    // Leise ignorieren, falls Rules noch nicht deployed oder offline
  }
}

/**
 * Markiert den Artikel als "durchgelesen" (>= 75 % Scrolltiefe), max. 1x pro User.
 */
export async function recordArticleReadThrough({ slug, user, profile, scrollPct = 100 }) {
  if (!isFirebaseConfigured || !db || !slug || !user?.uid || profile?.status !== 'approved') return;

  const sessionKey = `kb_article_read_${slug}_${user.uid}`;
  try {
    if (window.sessionStorage.getItem(sessionKey) === '1') return;
    window.sessionStorage.setItem(sessionKey, '1');
  } catch {
    // ignore
  }

  try {
    const viewRef = doc(db, 'articles', slug, 'views', user.uid);
    const articleRef = doc(db, 'articles', slug);
    const snap = await getDoc(viewRef);
    const prev = snap.exists() ? snap.data() : null;
    const clampedPct = Math.min(100, Math.max(75, Math.round(scrollPct)));

    if (prev && prev.readThrough) {
      if ((prev.maxScrollPct || 0) < clampedPct) {
        await updateDoc(viewRef, { maxScrollPct: clampedPct, lastSeenAt: serverTimestamp() });
      }
      return;
    }

    const batch = writeBatch(db);
    batch.set(
      viewRef,
      {
        uid: user.uid,
        maxScrollPct: clampedPct,
        readThrough: true,
        lastSeenAt: serverTimestamp(),
      },
      { merge: true }
    );
    batch.set(
      articleRef,
      {
        slug,
        readThroughCount: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await batch.commit();
  } catch {
    // ignore
  }
}

/**
 * Setzt, wechselt oder entfernt die Emoji-Reaktion eines Nutzers auf einem Artikel.
 */
export async function toggleArticleReaction({ slug, user, profile, reactionId, currentReactionId }) {
  if (!isFirebaseConfigured || !db || !slug || !user?.uid || profile?.status !== 'approved') return;

  const reactionRef = doc(db, 'articles', slug, 'reactions', user.uid);
  const articleRef = doc(db, 'articles', slug);
  const batch = writeBatch(db);

  if (currentReactionId === reactionId) {
    batch.delete(reactionRef);
    batch.set(
      articleRef,
      {
        slug,
        reactionsCount: increment(-1),
        reactionCounts: { [reactionId]: increment(-1) },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } else {
    batch.set(reactionRef, {
      uid: user.uid,
      reaction: reactionId,
      kickbaseName: profile.kickbaseName || profile.displayName || 'Manager',
      updatedAt: serverTimestamp(),
    });
    const reactionDelta = { [reactionId]: increment(1) };
    if (currentReactionId) {
      reactionDelta[currentReactionId] = increment(-1);
    }
    batch.set(
      articleRef,
      {
        slug,
        ...(currentReactionId ? {} : { reactionsCount: increment(1) }),
        reactionCounts: reactionDelta,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
}

/**
 * Speichert einen neuen Kommentar und loest bei erkannten @-Erwaehnungen
 * automatisch den Mention-Push-Endpunkt aus.
 */
export async function addArticleComment({ slug, articleTitle, text, user, profile, managers = [] }) {
  if (!isFirebaseConfigured || !db || !slug || !user?.uid || profile?.status !== 'approved') {
    throw new Error('Kommentare sind nur für freigegebene Manager verfügbar.');
  }

  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Bitte gib einen Kommentar ein.');
  if (trimmed.length > 1000) throw new Error('Maximal 1.000 Zeichen erlaubt.');

  const mentions = extractMentions(trimmed, managers);
  const authorName = profile.displayName || user.displayName || user.email || 'Manager';
  const kickbaseName = profile.kickbaseName || authorName;

  const commentsCol = collection(db, 'articles', slug, 'comments');
  const createdRef = await addDoc(commentsCol, {
    uid: user.uid,
    authorName,
    kickbaseName,
    authorRole: profile.role || 'user',
    text: trimmed,
    mentions: mentions.names,
    createdAt: serverTimestamp(),
  });

  await setDoc(
    doc(db, 'articles', slug),
    {
      slug,
      commentsCount: increment(1),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // Push-Benachrichtigung NUR wenn mindestens eine @-Erwaehnung enthalten ist
  if (mentions.names.length > 0 || mentions.kickbaseIds.length > 0) {
    try {
      const idToken = await user.getIdToken();
      fetch('/api/notify-comment-mention', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          slug,
          articleTitle,
          commentText: trimmed,
          mentionedNames: mentions.names,
          mentionedKickbaseIds: mentions.kickbaseIds,
        }),
      }).catch(() => {});
    } catch {
      // Push ist Best-Effort und darf das Kommentieren nicht blockieren
    }
  }

  return createdRef.id;
}

export async function updateArticleComment({ slug, commentId, text }) {
  if (!isFirebaseConfigured || !db || !slug || !commentId) return;
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.length > 1000) {
    throw new Error('Kommentar muss zwischen 1 und 1.000 Zeichen lang sein.');
  }
  await updateDoc(doc(db, 'articles', slug, 'comments', commentId), {
    text: trimmed,
    editedAt: serverTimestamp(),
  });
}

export async function deleteArticleComment({ slug, commentId }) {
  if (!isFirebaseConfigured || !db || !slug || !commentId) return;
  await deleteDoc(doc(db, 'articles', slug, 'comments', commentId));
  await setDoc(
    doc(db, 'articles', slug),
    {
      slug,
      commentsCount: increment(-1),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Laedt einmalig alle Artikel-Aggregat-Zaehler (fuer Feed-Badges & Admin-Analytics).
 */
export async function loadAllArticleStats() {
  if (!isFirebaseConfigured || !db) return {};
  try {
    const snap = await getDocs(collection(db, 'articles'));
    const map = {};
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      map[docSnap.id] = {
        slug: docSnap.id,
        viewsCount: Math.max(0, Number(d.viewsCount || 0)),
        readThroughCount: Math.max(0, Number(d.readThroughCount || 0)),
        commentsCount: Math.max(0, Number(d.commentsCount || 0)),
        reactionsCount: Math.max(0, Number(d.reactionsCount || 0)),
        reactionCounts: d.reactionCounts || {},
        updatedAt: d.updatedAt || null,
      };
    });
    return map;
  } catch {
    return {};
  }
}
