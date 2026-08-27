import React, { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from './AuthContext';

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
    setStatus('Sende...');

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
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, body, link })
      });

      const data = await response.json();

      if (response.ok) {
        setStatusOk(true);
        setStatus(`Gesendet an ${data.sent} Gerät(e). (Fehlgeschlagen: ${data.failed || 0})`);
        setBody(''); // Reset message
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
    <div className="card-surface rounded-xl px-4 py-3 mb-6">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-white uppercase">Messenger</h2>
        <p className="text-[11px] text-[#8b92a5] mt-1">Sende eine Push-Benachrichtigung an alle Nutzer.</p>
      </div>
      
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] font-bold text-[#8b92a5] uppercase mb-1">Titel</label>
          <input 
            type="text" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            className="w-full bg-[#1f1f1f] border border-[#2e2e2e] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#ff5c3e]"
          />
        </div>
        
        <div>
          <label className="block text-[10px] font-bold text-[#8b92a5] uppercase mb-1">Nachricht</label>
          <textarea 
            value={body} 
            onChange={e => setBody(e.target.value)} 
            rows="3"
            placeholder="Text eingeben..."
            className="w-full bg-[#1f1f1f] border border-[#2e2e2e] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#ff5c3e]"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-[#8b92a5] uppercase mb-1">Link (Optional)</label>
          <input 
            type="text" 
            value={link} 
            onChange={e => setLink(e.target.value)} 
            placeholder="/"
            className="w-full bg-[#1f1f1f] border border-[#2e2e2e] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#ff5c3e]"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={isSending || !title || !body}
          className="w-full mt-2 bg-[#ff5c3e] text-white text-xs font-bold uppercase tracking-widest py-2.5 rounded-lg hover:bg-[#ff4520] transition-colors disabled:opacity-50"
        >
          {isSending ? 'Sende...' : 'Nachricht Senden'}
        </button>

        {status && (
          <div className={`flex items-center gap-1.5 text-[11px] mt-2 font-bold ${statusOk ? 'text-green-400' : 'text-red-400'}`}>
            {status !== 'Sende...' && (statusOk ? <CheckCircle2 size={13} /> : <XCircle size={13} />)}
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
