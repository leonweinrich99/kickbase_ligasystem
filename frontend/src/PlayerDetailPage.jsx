import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useBackNavigation } from './useBackNavigation';
import { useFavorites } from './useFavorites';
import { BackButton } from './ui/CloseButton';
import { PlayerDetailView } from './Advisor';
import { resolveFullPlayerById } from './playerDetailData';

const PlayerDetailPage = () => {
  const { playerId } = useParams();
  const goBack = useBackNavigation('/');
  const { isFavorite, toggleFavorite } = useFavorites();

  const [state, setState] = useState({ loading: true, player: null, teamLogos: {} });

  useEffect(() => {
    let cancelled = false;
    resolveFullPlayerById(playerId).then((res) => {
      if (!cancelled) {
        setState({ loading: false, player: res.player, teamLogos: res.teamLogos });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (state.loading) {
    return (
      <div className="min-h-screen bg-[#000000] text-white px-4 sm:px-6 pt-5 max-w-2xl mx-auto">
        <div className="mb-6">
          <BackButton onClick={goBack} />
        </div>
        <div className="h-32 rounded-2xl card-surface animate-pulse mb-4" />
        <div className="h-48 rounded-2xl card-surface animate-pulse mb-4" />
        <div className="h-44 rounded-2xl card-surface animate-pulse" />
      </div>
    );
  }

  if (!state.player) {
    return (
      <div className="min-h-screen bg-[#000000] text-white px-4 sm:px-6 pt-5 max-w-2xl mx-auto">
        <div className="mb-6">
          <BackButton onClick={goBack} />
        </div>
        <div className="card-surface rounded-2xl p-6 text-center text-sm text-[#8b92a5]">
          Spielerdaten konnten nicht geladen werden.
        </div>
      </div>
    );
  }

  return (
    <PlayerDetailView
      player={state.player}
      teamLogos={state.teamLogos}
      onClose={goBack}
      isFavorite={isFavorite(state.player.playerId)}
      onToggleFavorite={toggleFavorite}
    />
  );
};

export default PlayerDetailPage;
