import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';
import { BackButton } from './ui/CloseButton';
import FifaManagerCard from './ui/FifaManagerCard';
import RatingCalculationSection from './ui/RatingCalculationSection';
import OverallRatingBreakdown from './ui/OverallRatingBreakdown';

// Vollbild-Seite (eigene Route /account/manager-rating) statt Bottom-Sheet-
// Modal - gleiche Design-Strategie wie UserDetail/OptimalTeam: sticky Header
// mit Zurueck-Button, Inhalt direkt darunter, kein Card-Rahmen mehr.

const ManagerRatingPage = () => {
  const { profile } = useAuth();
  const kickbaseId = profile?.kickbaseId;
  const goBack = useBackNavigation('/account');
  const [rating, setRating] = useState(null);
  const [allRatings, setAllRatings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!kickbaseId) {
      setLoading(false);
      return;
    }
    fetch('/history/manager-ratings.json')
      .then(res => res.json())
      .then(data => {
        setRating(data[kickbaseId] || null);
        setAllRatings(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Could not load ratings", err);
        setLoading(false);
      });
  }, [kickbaseId]);

  // Liga-Vergleichslisten fuer OVP/AKT (siehe RatingCalculationSection) -
  // muss VOR den frühen Returns stehen (Rules of Hooks), daher robust gegen
  // rating/allRatings === null.
  const leaguePeers = useMemo(() => {
    if (!allRatings || !rating) return { ovp: [], akt: [] };
    const peers = Object.entries(allRatings)
      .filter(([, r]) => r.league === rating.league)
      .map(([uid, r]) => ({ uid, name: r.name, r }));

    const ovp = peers
      .filter(p => p.r.calculation?.ovp?.averageOverpayRatio != null)
      .map(p => ({ name: p.name, value: p.r.calculation.ovp.averageOverpayRatio, isYou: p.uid === kickbaseId }))
      .sort((a, b) => a.value - b.value);

    const akt = peers
      .map(p => ({ name: p.name, value: p.r.calculation.akt.totalTransactions, isYou: p.uid === kickbaseId }))
      .sort((a, b) => b.value - a.value);

    return { ovp, akt };
  }, [allRatings, rating, kickbaseId]);

  if (loading) {
    return <div className="min-h-screen bg-[#000000]"></div>;
  }

  if (!rating) {
    return (
      <div className="min-h-screen bg-[#000000] flex flex-col justify-center items-center gap-6 p-4 text-center">
        <div className="text-gray-400 text-lg font-bold">Noch kein Manager Rating verfügbar</div>
        <button
          onClick={goBack}
          className="bg-[#171717] border border-[#2e2e2e] px-6 py-3 rounded-xl text-gray-300 hover:text-white hover:border-[#ff5c3e] transition-all"
        >
          Zurück zum Account
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#000000] min-h-screen relative flex flex-col pb-10">
      {/* Header mit Zurueck-Button (Page-Look) */}
      <div className="sticky top-0 z-40 bg-[#000000]/90 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between border-b border-[#2e2e2e]/50">
        <BackButton onClick={goBack} />
        <span className="text-xs font-bold uppercase tracking-wider text-[#8b92a5]">Manager Rating</span>
      </div>

      <div className="max-w-[600px] w-full mx-auto pt-6 pb-8 px-4 sm:px-6 flex flex-col gap-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-tight">Manager Rating</h2>
          <p className="text-sm text-[#8b92a5] mt-1">Wie gut managst du deinen Kader?</p>
        </div>

        {/* FIFA-Karte: Score, Foto, Name, 6 Attribute (ersetzt Score-Kreis
            + die frueheren 3 Teilscore-Kacheln) */}
        <FifaManagerCard rating={rating} photoURL={profile?.photoURL} />

        {/* Transparenz: woraus setzen sich die 6 Kartenwerte zusammen? Nutzt
            die vom Backend mitgelieferten Rohdaten/Formeln 1:1. */}
        <RatingCalculationSection
          calculation={rating.calculation}
          ovpLeaguePeers={leaguePeers.ovp}
          aktLeaguePeers={leaguePeers.akt}
        />

        {/* Wie wird aus den Boni der 0-100-Gesamtscore (und damit die
            Kartenstufe Bronze/Silber/Gold)? */}
        <OverallRatingBreakdown rating={rating} />
      </div>
    </div>
  );
};

export default ManagerRatingPage;
