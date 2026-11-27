import React, { useState } from 'react';
import { CheckCircle2, XCircle, Megaphone, Send, Bell } from './ui/icons';
import { useAuth } from './AuthContext';

const QUICK_LINKS = [
  { label: 'Liga', value: '/' },
  { label: 'News', value: '/feed' },
  { label: 'Live', value: '/live' },
  { label: 'Pokal', value: '/pokal' },
  { label: 'Account', value: '/account' },
];

export default function AdminMessengerCard() {
  const { user } = useAuth();
  const [title, setTitle] = useState('Benachrichtigung von Kickbase Ligasystem');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('/');
  const [status, setStatus] = useState('');
  const [statusOk, setStatusOk] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!title || !body) {
      setStatusOk(false);
      setStatus('Titel und Nachricht dürfen nicht leer sein.');
      return;
    }

    if (!window.confirm('Willst du diese Nachricht wirklich an ALLE Nutzer mit aktivierten Benachrichtigungen senden?')) {
      return;
    }

    setIsSending(true);
    setStatus('Sende…');

    try {
      if (!user) {
        setStatusOk(false);
        setStatus('Fehler: Nicht eingeloggt.');
        setIsSending(false);
        return;
      }

      const token = await user.getIdToken();
      if (!token) {
        setStatusOk(false);
        setStatus('Fehler: Konnte kein Auth-Token generieren.');
        setIsSending(false);
        return;
      }

      const response = await fetch('/api/admin-broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title, body, link }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatusOk(true);
        setStatus(`Gesendet an ${data.sent} Gerät(e). (Fehlgeschlagen: ${data.failed || 0})`);
        setBody('');
      } else {
        setStatusOk(false);
        setStatus(`Fehler: ${data.error || data.reason || 'Unbekannter Fehler'}`);
      }
    } catch (err) {
      setStatusOk(false);
      setStatus(`Netzwerkfehler: ${err.message}`);
    } finally {
      setIsSending(false);
      setTimeout(() => setStatus(''), 8000);
    }
  };

  return (
    <div className="card-surface oct-box rounded-2xl p-5 mb-6">
      {/* Header im einheitlichen Admin-Card-Stil */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-3.5 border-b border-white/[0.07]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="oct-sm oct-bd-none w-9 h-9 rounded-xl bg-[#ff5c3e]/15 text-[#ff5c3e] flex items-center justify-center shrink-0">
            <Megaphone size={17} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-white uppercase tracking-wider leading-tight">
              Push-Messenger
            </h2>
            <p className="text-[11px] text-[#8b92a5] mt-0.5 truncate">
              Broadcast an alle Geräte mit aktivierten Push-Alarmen
            </p>
          </div>
        </div>
        <span className="oct-pill oct-bd-accent bg-[#ff5c3e]/12 border border-[#ff5c3e]/30 text-[#ff846d] text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shrink-0">
          Alle
        </span>
      </div>

      <div className="space-y-3.5">
        <div>
          <label className="block text-[10px] font-black text-[#788092] uppercase tracking-[0.14em] mb-1.5">
            Titel
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kurze Überschrift…"
            className="oct-md w-full bg-[#0a0a0d] border border-[#2a2a30] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-[#ff5c3e] transition-colors"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[10px] font-black text-[#788092] uppercase tracking-[0.14em]">
              Nachricht
            </label>
            <span className="text-[10px] text-[#626978] tabular-nums">{body.length} Zeichen</span>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows="3"
            placeholder="Text eingeben, der auf dem Sperrbildschirm erscheint…"
            className="oct-md w-full bg-[#0a0a0d] border border-[#2a2a30] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-[#ff5c3e] transition-colors resize-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-[#788092] uppercase tracking-[0.14em] mb-1.5">
            Ziel-Seite beim Tippen (optional)
          </label>
          <input
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/"
            className="oct-md w-full bg-[#0a0a0d] border border-[#2a2a30] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#ff5c3e] transition-colors"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {QUICK_LINKS.map((preset) => {
              const active = link === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setLink(preset.value)}
                  className={`oct-pill px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                    active
                      ? 'oct-bd-accent bg-[#ff5c3e]/20 border-[#ff5c3e]/50 text-[#ff846d]'
                      : 'bg-[#121318] border-white/10 text-[#8b92a5] hover:text-white hover:border-white/25'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Kompakte Live-Vorschau */}
        {(title.trim() || body.trim()) && (
          <div className="oct-md bg-[#0a0a0d] border border-white/[0.08] rounded-xl p-3">
            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.16em] text-[#626978] mb-1.5">
              <span className="inline-flex items-center gap-1">
                <Bell size={10} className="text-[#ff5c3e]" />
                Push-Vorschau
              </span>
              <span>Jetzt</span>
            </div>
            <div className="text-xs font-bold text-white leading-snug">
              {title.trim() || 'Ohne Titel'}
            </div>
            <div className="text-[11px] text-[#9ca3b5] mt-0.5 leading-snug whitespace-pre-wrap break-words">
              {body.trim() || 'Hier erscheint dein Nachrichtentext…'}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleSend}
          disabled={isSending || !title || !body}
          className="oct-md oct-bd-none w-full flex items-center justify-center gap-2 bg-[#ff5c3e] hover:bg-[#ff4b2b] text-white text-[11px] font-black uppercase tracking-widest py-3 rounded-xl transition-all active:scale-[0.99] disabled:opacity-40 cursor-pointer shadow-[0_8px_20px_-10px_rgba(255,92,62,0.75)]"
        >
          <Send size={13} />
          <span>{isSending ? 'Sende…' : 'Nachricht an alle senden'}</span>
        </button>

        {status && (
          <div
            className={`oct-sm flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl border font-bold ${
              statusOk
                ? 'oct-bd-green bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'oct-bd-red bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            {status !== 'Sende…' && (statusOk ? <CheckCircle2 size={14} className="shrink-0" /> : <XCircle size={14} className="shrink-0" />)}
            <span>{status}</span>
          </div>
        )}
      </div>
    </div>
  );
}
