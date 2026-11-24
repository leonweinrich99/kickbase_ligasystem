import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Sparkles, ChevronRight, Info } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { enrichPlayerWithCatalog } from '../advisorSquadEval';
import { formatArticleDate } from '../feedMeta';
import AdvisorPlayerCard from './AdvisorPlayerCard';
import { StartProbLegend } from './StartProbBadge';

const HOT_SHOTS_LIMIT = 10;

// Gecachter Loader fuer die Trading-Advisor-Datenbank + all_players.json,
// damit Tab-Wechsel im Newsfeed kein wiederholtes Laden ausloesen.
let hotShotsPromise = null;
const loadHotShotsBundle = () => {
  if (!hotShotsPromise) {
    hotShotsPromise = Promise.all([
      fetch('/advisor-data.json', { cache: 'no-cache' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch('/history/all_players.json')
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ]).then(([advisorData, allPlayersRaw]) => {
      if (!advisorData) {
        hotShotsPromise = null;
      }
      return { advisorData, allPlayersRaw };
    });
  }
  return hotShotsPromise;
};

// Sneak-Peek-Bereich im Newsfeed fuer alle Nutzer (Owner-Wunsch 24.11.2026):
// zeigt die Top 10 der am staerksten steigenden Spieler aus der Trading-Advisor-
// Datenbank im identischen Karten-Design wie im Trading Advisor.
const HotShotsSection = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLegend, setShowLegend] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadHotShotsBundle().then((res) => {
      if (!cancelled) {
        setBundle(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { topPlayers, teamLogos, generatedDate } = useMemo(() => {
    const advisorData = bundle?.advisorData;
    const allPlayersRaw = bundle?.allPlayersRaw;

    const catalogMap = new Map();
    const logos = {};
    if (Array.isArray(allPlayersRaw)) {
      allPlayersRaw.forEach((p) => {
        if (p?.i != null) catalogMap.set(String(p.i), p);
        if (p?.tn && p?.tim && !logos[p.tn]) {
          logos[p.tn] = `https://kickbase.b-cdn.net/${p.tim}`;
        }
      });
    }

    const teamsData = advisorData?.leagues ? Object.values(advisorData.leagues)[0]?.teams || [] : [];
    teamsData.forEach((t) => {
      if (t.tn) {
        const svgKey = Object.keys(t).find((k) => typeof t[k] === 'string' && t[k].endsWith('.svg'));
        if (svgKey) {
          logos[t.tn] = `https://kickbase.b-cdn.net/${t[svgKey]}`;
        }
      }
    });

    const players = (advisorData?.players || [])
      .map((p) => enrichPlayerWithCatalog(p, catalogMap))
      .filter((p) => (p.predictedChange || 0) > 0)
      .sort((a, b) => (b.predictedChange || 0) - (a.predictedChange || 0))
      .slice(0, HOT_SHOTS_LIMIT);

    const genDate = advisorData?.generatedAt ? String(advisorData.generatedAt).slice(0, 10) : null;
    return { topPlayers: players, teamLogos: logos, generatedDate: genDate };
  }, [bundle]);

  const openInAdvisor = (playerId) => {
    if (!isAdmin || !playerId) return;
    navigate(`/admin/advisor?playerId=${encodeURIComponent(String(playerId))}`, {
      state: { openPlayerId: String(playerId), returnOnClose: true },
    });
  };

  if (!loading && topPlayers.length === 0) return null;

  return (
    <section className="mt-8 pt-6 border-t border-white/10">
      <div className="flex items-end justify-between gap-3 mb-3.5">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-1">
            <Sparkles size={11} />
            <span>Trading Advisor · Sneak Peek</span>
          </div>
          <h3 className="text-base sm:text-lg font-black uppercase tracking-wider text-white flex items-center gap-1.5">
            <Flame size={16} className="text-[#ff5c3e] shrink-0" />
            <span>Aktuelle Hot Shots</span>
          </h3>
          <p className="text-[11px] text-[#8b92a5] mt-0.5">
            Top 10 der am stärksten steigenden Spieler laut Marktwert-Prognose.
          </p>
        </div>

        <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setShowLegend((v) => !v)}
              aria-label="Legende Startelf-Prognose anzeigen"
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                showLegend
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                  : 'bg-white/[0.04] border-white/15 text-[#8b92a5] hover:text-white'
              }`}
            >
              <Info size={10} />
              <span>Legende</span>
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate('/admin/advisor')}
                className="inline-flex items-center gap-0.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
              >
                <span>Advisor</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>
          {generatedDate && (
            <div className="text-[10px] text-[#626978] tabular-nums mt-1">
              Stand {formatArticleDate(generatedDate)}
            </div>
          )}
        </div>
      </div>

      {showLegend && <StartProbLegend className="mb-3.5" />}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-[72px] rounded-xl card-surface animate-pulse" />
          ))}
        </div>
      ) : (
        <div>
          {topPlayers.map((entry, idx) => (
            <AdvisorPlayerCard
              key={`${entry.playerId ?? entry.name}-${idx}`}
              entry={entry}
              teamLogo={teamLogos[entry.team]}
              showGenericBadges
              onClick={isAdmin ? () => openInAdvisor(entry.playerId) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default HotShotsSection;
