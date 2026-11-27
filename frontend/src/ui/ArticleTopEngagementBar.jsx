import React, { useEffect, useRef, useState } from 'react';
import { ARTICLE_REACTIONS } from '../articleEngagement';
import { Eye, MessageCircle } from './icons';

/**
 * Kompakte Aktionsleiste direkt oben am Artikel-Start:
 * - Reaktion-Button (oeffnet schnellen Emoji-Picker)
 * - Kommentar-Button (springt smooth nach unten zu #kommentare)
 * - Gesehen-Zaehler (nur Zahl fuer alle Nutzer)
 */
const ArticleTopEngagementBar = ({
  stats,
  myReaction,
  reacting,
  onToggleReaction,
  onJumpToComments,
  accent = '#ff5c3e',
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const handleOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [pickerOpen]);

  const activeReactionObj = ARTICLE_REACTIONS.find((r) => r.id === myReaction) || null;
  const reactionsTotal = Math.max(0, Number(stats?.reactionsCount || 0));
  const commentsTotal = Math.max(0, Number(stats?.commentsCount || 0));
  const viewsTotal = Math.max(0, Number(stats?.viewsCount || 0));

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap mt-3">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Reaktion-Button mit schnellem Popover */}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            disabled={reacting}
            onClick={() => setPickerOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all cursor-pointer active:scale-95 tabular-nums ${
              activeReactionObj
                ? 'bg-white/15 border-white/30 text-white'
                : 'bg-white/[0.04] border-white/10 text-gray-200 hover:bg-white/[0.08] hover:border-white/20'
            }`}
            style={
              activeReactionObj
                ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}40` }
                : undefined
            }
          >
            <span className="text-sm leading-none">{activeReactionObj ? activeReactionObj.emoji : '🔥'}</span>
            <span>{reactionsTotal > 0 ? reactionsTotal : 'Reagieren'}</span>
          </button>

          {pickerOpen && (
            <div className="absolute left-0 top-full mt-2 z-30 flex items-center gap-1 p-1.5 rounded-2xl bg-[#14151a] border border-white/15 shadow-2xl">
              {ARTICLE_REACTIONS.map((r) => {
                const count = Math.max(0, Number(stats?.reactionCounts?.[r.id] || 0));
                const isSelected = myReaction === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={reacting}
                    onClick={() => {
                      onToggleReaction?.(r.id);
                      setPickerOpen(false);
                    }}
                    title={r.label}
                    aria-label={`${r.label}${count > 0 ? ` (${count})` : ''}`}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-90 tabular-nums ${
                      isSelected
                        ? 'bg-white/15 text-white'
                        : 'text-gray-300 hover:bg-white/[0.08]'
                    }`}
                  >
                    <span className="text-base leading-none">{r.emoji}</span>
                    {count > 0 && <span className="text-[11px]">{count}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Kommentar-Button: springt direkt nach unten */}
        <button
          type="button"
          onClick={onJumpToComments}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-gray-200 hover:bg-white/[0.08] hover:border-white/20 transition-all cursor-pointer active:scale-95 tabular-nums"
        >
          <MessageCircle size={13} style={{ color: accent }} />
          <span>{commentsTotal > 0 ? `${commentsTotal} ${commentsTotal === 1 ? 'Kommentar' : 'Kommentare'}` : 'Kommentare'}</span>
        </button>
      </div>

      {viewsTotal > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-[#8b92a5] tabular-nums">
          <Eye size={12} />
          <span>{viewsTotal} gelesen</span>
        </span>
      )}
    </div>
  );
};

export default ArticleTopEngagementBar;
