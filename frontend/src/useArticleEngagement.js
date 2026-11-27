import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { useAuth } from './AuthContext';
import {
  recordArticleReadThrough,
  recordArticleView,
  toggleArticleReaction,
} from './articleEngagement';

const EMPTY_STATS = {
  viewsCount: 0,
  readThroughCount: 0,
  commentsCount: 0,
  reactionsCount: 0,
  reactionCounts: {},
};

/**
 * Gemeinsamer Live-State fuer Top-Bar und unteren Kommentar-/Reaktionsbereich
 * eines Artikels (ein einziger Firestore-Listener pro Artikel).
 */
export function useArticleEngagement(slug) {
  const { user, profile } = useAuth();
  const isApproved = profile?.status === 'approved';

  const [stats, setStats] = useState(EMPTY_STATS);
  const [myReaction, setMyReaction] = useState(null);
  const [reacting, setReacting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Eindeutigen Aufruf + Scroll-Lesetiefe erfassen
  useEffect(() => {
    if (!slug || !user?.uid || !isApproved) return undefined;

    recordArticleView({ slug, user, profile });

    let ticked = false;
    let sentReadThrough = false;

    const handleScroll = () => {
      if (sentReadThrough || ticked) return;
      ticked = true;
      window.requestAnimationFrame(() => {
        ticked = false;
        const docEl = document.documentElement;
        const scrollable = docEl.scrollHeight - window.innerHeight;
        const pct =
          scrollable <= 0
            ? 100
            : ((window.scrollY + window.innerHeight) / docEl.scrollHeight) * 100;
        if (pct >= 75) {
          sentReadThrough = true;
          recordArticleReadThrough({ slug, user, profile, scrollPct: pct });
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [slug, user, profile, isApproved]);

  // Live-Abo auf Aggregat-Zaehler + eigene Reaktion
  useEffect(() => {
    if (!isFirebaseConfigured || !db || !slug || !user?.uid || !isApproved) {
      return undefined;
    }

    const unsubStats = onSnapshot(
      doc(db, 'articles', slug),
      (snap) => {
        const d = snap.exists() ? snap.data() || {} : {};
        setStats({
          viewsCount: Math.max(0, Number(d.viewsCount || 0)),
          readThroughCount: Math.max(0, Number(d.readThroughCount || 0)),
          commentsCount: Math.max(0, Number(d.commentsCount || 0)),
          reactionsCount: Math.max(0, Number(d.reactionsCount || 0)),
          reactionCounts: d.reactionCounts || {},
        });
        setUnavailable(false);
      },
      () => {
        setUnavailable(true);
      }
    );

    const unsubReaction = onSnapshot(
      doc(db, 'articles', slug, 'reactions', user.uid),
      (snap) => {
        setMyReaction(snap.exists() ? snap.data()?.reaction || null : null);
      },
      () => {}
    );

    return () => {
      unsubStats();
      unsubReaction();
    };
  }, [slug, user?.uid, isApproved]);

  const handleToggleReaction = async (reactionId) => {
    if (reacting || !isApproved || !slug || !user?.uid) return;
    setReacting(true);
    try {
      await toggleArticleReaction({
        slug,
        user,
        profile,
        reactionId,
        currentReactionId: myReaction,
      });
    } finally {
      setReacting(false);
    }
  };

  return {
    stats,
    myReaction,
    reacting,
    unavailable,
    isEnabled: Boolean(isFirebaseConfigured && isApproved && user?.uid),
    toggleReaction: handleToggleReaction,
  };
}
