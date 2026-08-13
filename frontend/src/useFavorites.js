import { useCallback, useMemo } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';

// Favoriten-Spieler werden am eigenen Nutzerprofil in Firestore gespeichert
// (Feld "favoritePlayers", Array aus Kickbase-Spieler-IDs als String) - so
// sind sie geraeteuebergreifend synchron, genau wie Kickbase-Name & Co.
export const useFavorites = () => {
  const { user, profile } = useAuth();
  const favoritePlayers = useMemo(() => profile?.favoritePlayers || [], [profile]);

  const isFavorite = useCallback(
    (playerId) => favoritePlayers.includes(String(playerId)),
    [favoritePlayers]
  );

  const toggleFavorite = useCallback(
    async (playerId) => {
      if (!user) return;
      const id = String(playerId);
      const ref = doc(db, 'users', user.uid);
      try {
        if (isFavorite(id)) {
          await updateDoc(ref, { favoritePlayers: arrayRemove(id) });
        } else {
          await updateDoc(ref, { favoritePlayers: arrayUnion(id) });
        }
      } catch (error) {
        console.error('Favorit konnte nicht gespeichert werden:', error.message);
      }
    },
    [user, isFavorite]
  );

  return { favoritePlayers, isFavorite, toggleFavorite };
};
