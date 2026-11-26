import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useBackNavigation } from './useBackNavigation';
import { BackButton } from './ui/CloseButton';
import FifaManagerCard from './ui/FifaManagerCard';
import RatingCalculationSection from './ui/RatingCalculationSection';

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

  // Liga-Vergleichslisten fuer alle 6 gewichteten Karten-Attribute
  const leaguePeers = useMemo(() => {
    if (!allRatings || !rating) return { kad: [], pkt: [], pro: [], dis: [], kon: [], eff: [] };
    const peers = Object.entries(allRatings)
      .filter(([, r]) => r.league === rating.league)
      .map(([uid, r]) => ({ uid, name: r.name, r }));

    const kad = peers
      .filter(p => p.r.calculation?.kad?.expectedLineupPoints != null)
      .map(p => ({ name: p.name, value: p.r.calculation.kad.expectedLineupPoints, isYou: p.uid === kickbaseId }))
      .sort((a, b) => b.value - a.value);

    const pkt = peers
      .filter(p => (p.r.calculation?.pkt?.points || 0) > 0)
      .map(p => ({ name: p.name, value: p.r.calculation.pkt.points, isYou: p.uid === kickbaseId }))
      .sort((a, b) => b.value - a.value);

    const pro = peers
      .filter(p => p.r.calculation?.pro?.weightedTotalProfit != null)
      .map(p => ({ name: p.name, value: p.r.calculation.pro.weightedTotalProfit, isYou: p.uid === kickbaseId }))
      .sort((a, b) => b.value - a.value);

    const dis = peers
      .filter(p => p.r.calculation?.dis?.disciplineRaw != null)
      .map(p => ({ name: p.name, value: p.r.calculation.dis.disciplineRaw, isYou: p.uid === kickbaseId }))
      .sort((a, b) => b.value - a.value);

    const kon = peers
      .filter(p => p.r.calculation?.kon?.floor3 != null)
      .map(p => ({ name: p.name, value: p.r.calculation.kon.floor3, isYou: p.uid === kickbaseId }))
      .sort((a, b) => b.value - a.value);

    const eff = peers
      .filter(p => p.r.calculation?.eff?.profitPerTrade != null)
      .map(p => ({ name: p.name, value: p.r.calculation.eff.profitPerTrade, isYou: p.uid === kickbaseId }))
      .sort((a, b) => b.value - a.value);

    return { kad, pkt, pro, dis, kon, eff };
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
      <div className="sticky sticky-safe-top z-50 bg-[#000000]/90 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center border-b border-[#2e2e2e]/50">
        <BackButton onClick={goBack} />
      </div>

      <div className="max-w-[600px] w-full mx-auto pt-6 pb-8 px-4 sm:px-6 flex flex-col gap-6">
        <div>
          <h2 className="text-[17px] sm:text-3xl font-black tracking-tight uppercase leading-[1.1] break-words">Manager Rating</h2>
          <p className="text-sm text-[#8b92a5] mt-1">Wie gut managst du deinen Kader?</p>
        </div>

        {/* FIFA-Karte: Score, Foto, Name, 6 Attribute (ersetzt Score-Kreis
            + die frueheren 3 Teilscore-Kacheln) */}
        <FifaManagerCard rating={rating} photoURL={profile?.photoURL} />

        {/* Transparenz: woraus setzen sich die 6 Kartenwerte zusammen? Nutzt
            die vom Backend mitgelieferten Rohdaten/Formeln 1:1. */}
        <RatingCalculationSection
          calculation={rating.calculation}
          kadLeaguePeers={leaguePeers.kad}
          pktLeaguePeers={leaguePeers.pkt}
          proLeaguePeers={leaguePeers.pro}
          disLeaguePeers={leaguePeers.dis}
          konLeaguePeers={leaguePeers.kon}
          effLeaguePeers={leaguePeers.eff}
        />
      </div>
    </div>
  );
};

export default ManagerRatingPage;
