import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Sparkles, ChevronRight } from './icons';
import { useAuth } from '../AuthContext';
import { enrichPlayerWithCatalog } from '../advisorSquadEval';
import { loadAdvisorDataCached, loadPlayerCatalogBundle } from '../playerDetailData';
import { formatArticleDate } from '../feedMeta';
import AdvisorPlayerCard from './AdvisorPlayerCard';

const HOT_SHOTS_LIMIT = 10;

// Gecachter Loader fuer Trading-Advisor-Datenbank + players-lite.json (~170 KB statt 40 MB)
let hotShotsPromise = null;
const loadHotShotsBundle = () => {
  if (!hotShotsPromise) {
    hotShotsPromise = Promise.all([
      loadAdvisorDataCached(),
      loadPlayerCatalogBundle(),
    ]).then(([advisorData, catalogBundle]) => {
      if (!advisorData) {
        hotShotsPromise = null;
      }
      return { advisorData, catalogBundle };
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
    const catalogBundle = bundle?.catalogBundle;
    const catalogMap = catalogBundle?.catalogMap || new Map();
    const xpMap = catalogBundle?.xpMap || new Map();
    const logos = { ...(catalogBundle?.teamLogos || {}) };

    const teamsData = advisorData?.leagues ? Object.values(advisorData.leagues)[0]?.teams || [] : [];
    teamsData.forEach((t) => {
      if (t.tn && !logos[t.tn]) {
        const svgKey = Object.keys(t).find((k) => typeof t[k] === 'string' && t[k].endsWith('.svg'));
        if (svgKey) {
          logos[t.tn] = `https://kickbase.b-cdn.net/${t[svgKey]}`;
        }
      }
    });

    const players = (advisorData?.players || [])
      .map((p) => enrichPlayerWithCatalog(p, catalogMap, xpMap))
      .filter((p) => (p.predictedChange || 0) > 0)
      .sort((a, b) => (b.predictedChange || 0) - (a.predictedChange || 0))
      .slice(0, HOT_SHOTS_LIMIT);

    const genDate = advisorData?.generatedAt ? String(advisorData.generatedAt).slice(0, 10) : null;
    return { topPlayers: players, teamLogos: logos, generatedDate: genDate };
  }, [bundle]);

  const openPlayerDetail = (playerId) => {
    if (!playerId) return;
    navigate(`/player/${encodeURIComponent(String(playerId))}`);
  };

  if (!loading && topPlayers.length === 0) return null;

  return (
    <section className="mt-8 pt-6 border-t border-white/10">
      <div className="mb-3.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400 min-w-0 truncate">
            <Sparkles size={11} className="shrink-0" />
            <span className="truncate">Trading Advisor · Sneak Peek</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {generatedDate && (
              <span className="text-[10px] text-[#626978] tabular-nums whitespace-nowrap">
                Stand {formatArticleDate(generatedDate)}
              </span>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate('/admin/advisor')}
                className="inline-flex items-center gap-0.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Advisor</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>

        <h3 className="text-base sm:text-lg font-black uppercase tracking-wider text-white flex items-center gap-1.5">
          <Flame size={16} className="text-[#ff5c3e] shrink-0" />
          <span>Aktuelle Hot Shots</span>
        </h3>
        <p className="text-[11px] text-[#8b92a5] mt-0.5">
          Top 10 der am stärksten steigenden Spieler laut Marktwert-Prognose.
        </p>
      </div>

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
                onClick={entry.playerId ? () => openPlayerDetail(entry.playerId) : undefined}
              />
          ))}
        </div>
      )}
    </section>
  );
};

export default HotShotsSection;
