import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { useAuth } from '../AuthContext';
import { useKickbaseManagers } from '../useKickbaseManagers';
import {
  ARTICLE_REACTIONS,
  addArticleComment,
  deleteArticleComment,
  extractMentions,
  formatRelativeTime,
  splitTextWithMentions,
  updateArticleComment,
} from '../articleEngagement';
import {
  AtSign,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  MessageCircle,
  Pencil,
  Send,
  Trash2,
  X,
} from './icons';

/**
 * Erkennt, ob der Cursor im Kommentarfeld gerade in einer @-Erwaehnung steht.
 * Liefert { start, query } oder null.
 */
function getActiveMentionToken(text, caretPos) {
  const before = text.slice(0, caretPos);
  const match = before.match(/(?:^|[\s(])@([^\s@]{0,24})$/);
  if (!match) return null;
  const queryText = match[1];
  const atIndex = before.lastIndexOf('@');
  if (atIndex < 0) return null;
  return { start: atIndex, query: queryText };
}

const ArticleEngagementSection = ({
  slug,
  articleTitle,
  accent = '#ff5c3e',
  stats,
  myReaction,
  reacting,
  unavailable,
  onToggleReaction,
  textareaRef: externalTextareaRef,
}) => {
  const { user, profile, isAdmin } = useAuth();
  const managers = useKickbaseManagers();

  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsUnavailable, setCommentsUnavailable] = useState(false);

  // Composer State
  const [text, setText] = useState('');
  const [caretPos, setCaretPos] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mentionIdx, setMentionIdx] = useState(0);
  const internalTextareaRef = useRef(null);
  const textareaRef = externalTextareaRef || internalTextareaRef;

  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Admin-Only Leserliste (normale Manager sehen NUR die Zahl!)
  const [showReaders, setShowReaders] = useState(false);
  const [readers, setReaders] = useState([]);
  const [readersLoading, setReadersLoading] = useState(false);

  const isApproved = profile?.status === 'approved';

  // Live-Abo auf Kommentare
  useEffect(() => {
    if (!isFirebaseConfigured || !db || !slug || !user?.uid || !isApproved) {
      setCommentsLoading(false);
      return undefined;
    }

    const commentsQ = query(
      collection(db, 'articles', slug, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsubComments = onSnapshot(
      commentsQ,
      (snap) => {
        setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCommentsLoading(false);
        setCommentsUnavailable(false);
      },
      () => {
        setCommentsLoading(false);
        setCommentsUnavailable(true);
      }
    );

    return () => unsubComments();
  }, [slug, user?.uid, isApproved]);

  // Direkt zu #kommentare scrollen (z.B. aus Mention-Push-Benachrichtigung)
  useEffect(() => {
    if (window.location.hash === '#kommentare' && !commentsLoading) {
      const el = document.getElementById('kommentare');
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      }
    }
  }, [commentsLoading]);

  // Admin-Leserliste erst bei Klick nachladen
  const toggleAdminReaders = async () => {
    if (!isAdmin) return;
    if (showReaders) {
      setShowReaders(false);
      return;
    }
    setShowReaders(true);
    setReadersLoading(true);
    try {
      const q = query(collection(db, 'articles', slug, 'views'), orderBy('lastSeenAt', 'desc'));
      const snap = await getDocs(q);
      setReaders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      setReaders([]);
    } finally {
      setReadersLoading(false);
    }
  };

  // @-Mention Autocomplete berechnen
  const activeMention = useMemo(() => getActiveMentionToken(text, caretPos), [text, caretPos]);

  const mentionSuggestions = useMemo(() => {
    if (!activeMention) return [];
    const q = activeMention.query.toLowerCase();
    const filtered = managers.filter((m) =>
      !q ? true : m.name.toLowerCase().includes(q)
    );
    return filtered.slice(0, 6);
  }, [activeMention, managers]);

  const detectedMentions = useMemo(
    () => extractMentions(text, managers),
    [text, managers]
  );

  const insertMention = (managerName) => {
    if (!activeMention) return;
    const before = text.slice(0, activeMention.start);
    const after = text.slice(caretPos);
    const inserted = `@${managerName} `;
    const nextText = `${before}${inserted}${after}`;
    const nextCaret = before.length + inserted.length;
    setText(nextText);
    setCaretPos(nextCaret);
    setMentionIdx(0);
    window.requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const triggerAtSymbol = () => {
    const el = textareaRef.current;
    const pos = el ? el.selectionStart : text.length;
    const needsSpace = pos > 0 && !/\s/.test(text[pos - 1]);
    const insert = needsSpace ? ' @' : '@';
    const nextText = `${text.slice(0, pos)}${insert}${text.slice(pos)}`;
    const nextCaret = pos + insert.length;
    setText(nextText);
    setCaretPos(nextCaret);
    setMentionIdx(0);
    window.requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const handleKeyDown = (e) => {
    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const picked = mentionSuggestions[mentionIdx] || mentionSuggestions[0];
        if (picked) insertMention(picked.name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCaretPos(0);
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmitComment();
    }
  };

  const handleReaction = async (reactionId) => {
    if (reacting || !isApproved) return;
    try {
      await onToggleReaction?.(reactionId);
    } catch {
      setError('Reaktion konnte nicht gespeichert werden.');
    }
  };

  const handleSubmitComment = async (e) => {
    if (e) e.preventDefault();
    if (submitting || !text.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await addArticleComment({
        slug,
        articleTitle,
        text,
        user,
        profile,
        managers,
      });
      setText('');
      setCaretPos(0);
    } catch (err) {
      setError(err?.message || 'Kommentar konnte nicht gesendet werden.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (commentId) => {
    if (savingEdit || !editText.trim()) return;
    setSavingEdit(true);
    setError('');
    try {
      await updateArticleComment({ slug, commentId, text: editText });
      setEditingId(null);
      setEditText('');
    } catch (err) {
      setError(err?.message || 'Änderung fehlgeschlagen.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (commentId) => {
    if (!window.confirm('Diesen Kommentar wirklich löschen?')) return;
    try {
      await deleteArticleComment({ slug, commentId });
    } catch {
      setError('Kommentar konnte nicht gelöscht werden.');
    }
  };

  if (!isFirebaseConfigured || !isApproved) return null;

  const displayedViews = Math.max(stats?.viewsCount || 0, 0);
  const displayedComments = Math.max(comments.length, stats?.commentsCount || 0);
  const firestoreUnavailable = Boolean(unavailable || commentsUnavailable);

  return (
    <section id="kommentare" className="mt-8 pt-6 border-t border-white/10 space-y-5 scroll-mt-4">
      {/* 1. Kompakte Interaktions-Leiste (fuer normale Manager NUR Zahlen) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin ? (
            <button
              type="button"
              onClick={toggleAdminReaders}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-gray-200 hover:border-white/25 transition-colors cursor-pointer tabular-nums"
              title="Als Admin anzeigen, wer den Artikel gelesen hat"
            >
              <Eye size={13} style={{ color: accent }} />
              <span>{displayedViews} gelesen</span>
              {showReaders ? <ChevronUp size={12} className="text-[#8b92a5]" /> : <ChevronDown size={12} className="text-[#8b92a5]" />}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-gray-300 tabular-nums">
              <Eye size={13} style={{ color: accent }} />
              <span>{displayedViews} gelesen</span>
            </span>
          )}

          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-gray-300 tabular-nums">
            <MessageCircle size={13} className="text-[#8b92a5]" />
            <span>{displayedComments} {displayedComments === 1 ? 'Kommentar' : 'Kommentare'}</span>
          </span>
        </div>

        {/* Emoji-Reaktionen */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {ARTICLE_REACTIONS.map((r) => {
            const count = Math.max(0, Number(stats?.reactionCounts?.[r.id] || 0));
            const isActive = myReaction === r.id;
            return (
              <button
                key={r.id}
                type="button"
                disabled={reacting}
                onClick={() => handleReaction(r.id)}
                title={r.label}
                aria-label={`${r.label}${count > 0 ? ` (${count})` : ''}`}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer active:scale-95 tabular-nums ${
                  isActive
                    ? 'bg-white/15 border-white/35 text-white'
                    : 'bg-white/[0.03] border-white/10 text-gray-300 hover:bg-white/[0.08] hover:border-white/20'
                }`}
                style={isActive ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}40` } : undefined}
              >
                <span className="text-sm leading-none">{r.emoji}</span>
                {count > 0 && <span>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Admin-only Leser-Aufklappbox */}
      {isAdmin && showReaders && (
        <div className="card-surface rounded-2xl p-3.5 sm:p-4 border border-purple-500/25">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="text-[10px] font-black uppercase tracking-widest text-purple-300">
              Admin-Ansicht · Leser ({readers.length})
              {stats?.readThroughCount > 0 ? ` · ${stats.readThroughCount} durchgelesen` : ''}
            </div>
            <button
              type="button"
              onClick={() => setShowReaders(false)}
              className="text-[#8b92a5] hover:text-white cursor-pointer"
              aria-label="Leserliste schließen"
            >
              <X size={14} />
            </button>
          </div>
          {readersLoading ? (
            <div className="text-xs text-[#8b92a5] py-2">Lade Leser...</div>
          ) : readers.length === 0 ? (
            <div className="text-xs text-[#8b92a5] py-1">Noch keine protokollierten Leser.</div>
          ) : (
            <div className="divide-y divide-white/[0.06] max-h-56 overflow-y-auto">
              {readers.map((rd) => (
                <div key={rd.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="font-semibold text-gray-100 truncate">
                      {rd.kickbaseName || rd.displayName || 'Unbekannt'}
                    </span>
                    {rd.readThrough && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                        <Check size={9} />
                        Gelesen
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#8b92a5] tabular-nums shrink-0">
                    {rd.viewCount > 1 ? `${rd.viewCount}× · ` : ''}
                    {formatRelativeTime(rd.lastSeenAt || rd.firstSeenAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {firestoreUnavailable && (
        <div className="card-surface rounded-2xl px-4 py-3 text-xs text-amber-300 border border-amber-500/30">
          Kommentare und Reaktionen werden aktiv, sobald die aktualisierten Firestore-Regeln veröffentlicht wurden.
        </div>
      )}

      {/* 2. Kommentar-Eingabe mit @-Mention Autocomplete */}
      <form onSubmit={handleSubmitComment} className="card-surface rounded-2xl p-3.5 sm:p-4 space-y-2.5 relative">
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-200 flex items-center gap-1.5">
          <MessageCircle size={13} style={{ color: accent }} />
          <span>Kommentare</span>
        </h3>

        <div className="relative">
          {/* Autocomplete-Popup fuer @Mentions */}
          {mentionSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 bottom-full mb-1.5 z-30 bg-[#14151a] border border-white/15 rounded-xl shadow-2xl overflow-hidden py-1">
              <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-[#8b92a5] border-b border-white/[0.06]">
                Manager markieren (sendet Push)
              </div>
              {mentionSuggestions.map((m, idx) => (
                <button
                  key={`${m.id}-${m.name}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(m.name);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    idx === mentionIdx ? 'bg-white/10 text-white' : 'text-gray-200 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="font-bold truncate">@{m.name}</span>
                  <span className="text-[10px] text-[#8b92a5] shrink-0">{m.league}</span>
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCaretPos(e.target.selectionStart);
              setMentionIdx(0);
            }}
            onClick={(e) => setCaretPos(e.target.selectionStart)}
            onKeyUp={(e) => setCaretPos(e.target.selectionStart)}
            onKeyDown={handleKeyDown}
            rows={2}
            maxLength={1000}
            placeholder="Schreib deinen Kommentar oder markiere jemanden mit @Name..."
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-[#6d7485] focus:outline-none focus:border-white/30 resize-none leading-relaxed"
          />
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <button
              type="button"
              onClick={triggerAtSymbol}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 text-[11px] font-bold text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <AtSign size={12} />
              <span>Erwähnen</span>
            </button>

            {detectedMentions.names.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-0.5 truncate max-w-[230px]">
                <Bell size={10} className="shrink-0" />
                <span className="truncate">
                  Push an {detectedMentions.names.map((n) => `@${n}`).join(', ')}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            {text.length > 800 && (
              <span className="text-[10px] text-[#8b92a5] tabular-nums">{text.length}/1000</span>
            )}
            <button
              type="submit"
              disabled={submitting || !text.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-40 cursor-pointer active:scale-95"
              style={{ backgroundColor: accent }}
            >
              <Send size={12} />
              <span>{submitting ? 'Sende...' : 'Posten'}</span>
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-[#ff5c3e] font-semibold">{error}</p>}
      </form>

      {/* 3. Kommentar-Liste */}
      {commentsLoading ? (
        <div className="card-surface rounded-2xl p-4 text-xs text-[#8b92a5]">Lade Kommentare...</div>
      ) : comments.length === 0 ? (
        <div className="card-surface rounded-2xl px-4 py-5 text-center text-xs text-[#8b92a5]">
          Noch keine Kommentare — starte die Diskussion zum Artikel!
        </div>
      ) : (
        <div className="space-y-2.5">
          {comments.map((c) => {
            const isOwn = c.uid === user?.uid;
            const canDelete = isOwn || isAdmin;
            const displayAuthor = c.kickbaseName || c.authorName || 'Manager';
            const isEditing = editingId === c.id;
            const parts = splitTextWithMentions(c.text, managers);

            return (
              <div key={c.id} className="card-surface rounded-2xl p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-[11px] font-black shrink-0"
                      style={{ color: accent }}
                    >
                      {displayAuthor.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-white truncate">{displayAuthor}</span>
                        {c.authorRole === 'admin' && (
                          <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            Admin
                          </span>
                        )}
                        {isOwn && (
                          <span className="text-[9px] font-semibold text-[#8b92a5]">(Du)</span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#8b92a5] tabular-nums">
                        {formatRelativeTime(c.createdAt)}
                        {c.editedAt ? ' · bearbeitet' : ''}
                      </div>
                    </div>
                  </div>

                  {(isOwn || canDelete) && !isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      {isOwn && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(c.id);
                            setEditText(c.text || '');
                          }}
                          aria-label="Kommentar bearbeiten"
                          className="p-1.5 rounded-lg text-[#8b92a5] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          aria-label="Kommentar löschen"
                          className="p-1.5 rounded-lg text-[#8b92a5] hover:text-[#ff5c3e] hover:bg-red-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2 mt-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-white/35 resize-none"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditText('');
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#8b92a5] hover:text-white cursor-pointer"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="button"
                        disabled={savingEdit || !editText.trim()}
                        onClick={() => handleSaveEdit(c.id)}
                        className="px-3 py-1 rounded-lg text-[11px] font-bold text-white disabled:opacity-40 cursor-pointer"
                        style={{ backgroundColor: accent }}
                      >
                        {savingEdit ? 'Speichere...' : 'Speichern'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
                    {parts.map((part, pIdx) =>
                      part.isMention ? (
                        <span
                          key={pIdx}
                          className="font-bold px-1 py-0.5 rounded bg-white/10"
                          style={{ color: accent }}
                        >
                          {part.text}
                        </span>
                      ) : (
                        <React.Fragment key={pIdx}>{part.text}</React.Fragment>
                      )
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ArticleEngagementSection;
