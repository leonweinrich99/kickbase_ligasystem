import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// Einheitliche Farbwelt je Rating-Stufe (normale Medaillen-Reihenfolge:
// Amateur < Bronze < Silber < Gold < Elite - siehe calculate-ratings.js).
const LEVEL_THEME = {
  Amateur: '#ef4444',
  Bronze: '#f97316',
  Silber: '#94a3b8',
  Gold: '#eab308',
  Elite: '#a855f7',
};

// Nur noch der kleine Badge-Button (Wabe mit Score) auf der Account-Seite -
// führt als Link zur eigenen Vollbild-Route /account/manager-rating (siehe
// ManagerRatingPage.jsx), statt ein Modal zu öffnen.
const ManagerRatingBadge = ({ kickbaseId }) => {
  const [rating, setRating] = useState(null);

  useEffect(() => {
    fetch('/history/manager-ratings.json')
      .then(res => res.json())
      .then(data => {
        if (data[kickbaseId]) setRating(data[kickbaseId]);
      })
      .catch(err => console.error("Could not load ratings", err));
  }, [kickbaseId]);

  if (!rating) return null;

  const color = LEVEL_THEME[rating.level] || LEVEL_THEME.Bronze;

  return (
    <Link
      to="/account/manager-rating"
      className="relative flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform"
      style={{ width: '42px', height: '46px' }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: color,
          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          opacity: 0.15
        }}
      />
      <div
        className="absolute inset-[2px] bg-[#1f1f1f] flex flex-col items-center justify-center"
        style={{
          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
        }}
      >
        <span className="text-[14px] font-black leading-none mt-0.5" style={{ color }}>{rating.score}</span>
      </div>
    </Link>
  );
};

export { LEVEL_THEME };
export default ManagerRatingBadge;
