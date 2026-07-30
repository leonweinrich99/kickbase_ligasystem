import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { enablePushNotifications, disablePushNotifications, isPushConfigured, needsHomeScreenInstall } from './pushNotifications';
import { DEFAULT_RULES, loadRules, saveRules } from './rulesConfig';

const StatusBadge = ({ status }) => {
  const styles = {
    approved: 'bg-green-500/10 text-green-400 border-green-500/30',
    pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/30'
  };
  const labels = { approved: 'Freigegeben', pending: 'Ausstehend', rejected: 'Abgelehnt' };
  return (
    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  );
};

const PushNotificationCard = () => {
  const { user, profile } = useAuth();
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [error, setError] = useState(null);
  const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('fcmToken') : null;
  const isEnabledOnThisDevice = Boolean(storedToken && profile?.fcmTokens?.includes(storedToken));

  if (!isPushConfigured()) return null;

  const handleEnable = async () => {
    setStatus('loading');
    setError(null);
    try {
      const token = await enablePushNotifications(user.uid);
      window.localStorage.setItem('fcmToken', token);
      setStatus('idle');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  };

  const handleDisable = async () => {
    setStatus('loading');
    try {
      await disablePushNotifications(user.uid, storedToken);
      window.localStorage.removeItem('fcmToken');
      setStatus('idle');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  };

  return (
    <div className="bg-[#171717] border border-[#2e2e2e] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <div className="font-bold text-gray-100">Push-Benachrichtigungen auf diesem Gerät</div>
        <div className="text-xs text-[#8b92a5]">Erhalte eine Mitteilung, sobald sich jemand Neues registriert.</div>
        {needsHomeScreenInstall() && (
          <div className="text-xs text-yellow-400 mt-1">Auf dem iPhone: App zuerst über „Zum Home-Bildschirm" installieren.</div>
        )}
        {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
      </div>
      {isEnabledOnThisDevice ? (
        <button
          onClick={handleDisable}
          disabled={status === 'loading'}
          className="text-[10px] font-black uppercase tracking-widest bg-green-500/10 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50 shrink-0"
        >
          {status === 'loading' ? '...' : '✓ Aktiviert (deaktivieren)'}
        </button>
      ) : (
        <button
          onClick={handleEnable}
          disabled={status === 'loading'}
          className="text-[10px] font-black uppercase tracking-widest bg-[#ff5c3e]/10 text-[#ff5c3e] border border-[#ff5c3e]/30 px-4 py-2 rounded-lg hover:bg-[#ff5c3e]/20 transition-colors disabled:opacity-50 shrink-0"
        >
          {status === 'loading' ? 'Aktiviere...' : 'Benachrichtigungen aktivieren'}
        </button>
      )}
    </div>
  );
};

const RuleEditor = () => {
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [activeType, setActiveType] = useState('league');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadRules().then(setRules).finally(() => setLoading(false));
  }, []);

  const updateRule = (type, id, field, value) => {
    setRules((current) => ({
      ...current,
      [type]: current[type].map((rule) => rule.id === id ? { ...rule, [field]: value } : rule),
    }));
  };

  const handleSave = async () => {
    setStatus('Speichere...');
    try {
      await saveRules(rules);
      setStatus('Regeln gespeichert');
      setTimeout(() => setStatus(null), 3500);
    } catch (error) {
      setStatus(`Fehler: ${error.message}`);
    }
  };

  if (loading) return <div className="text-sm text-[#8b92a5] py-6">Lade Regelwerk...</div>;

  return (
    <section className="mb-10">
      <button
        onClick={() => setIsOpen((open) => !open)}
        className="w-full bg-[#171717] border border-[#2e2e2e] rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 text-left hover:border-[#404040] transition-colors"
        aria-expanded={isOpen}
      >
        <div>
          <div className="text-[10px] font-bold tracking-wider text-[#ff5c3e] mb-1">INHALT</div>
          <h2 className="text-xl font-black uppercase text-white">Regelwerk</h2>
          <p className="text-xs text-[#8b92a5] mt-2">Nur öffnen, wenn du eine Regel ändern möchtest.</p>
        </div>
        <span className={`text-[#8b92a5] text-xl transition-transform ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {isOpen && <div className="mt-3 bg-[#171717] border border-[#2e2e2e] rounded-2xl p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap gap-2">
          {['league', 'cup'].map((type) => (
            <button key={type} onClick={() => setActiveType(type)} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${activeType === type ? 'bg-[#ff5c3e] text-white' : 'bg-[#000] border border-[#2e2e2e] text-[#8b92a5]'}`}>
              {type === 'league' ? 'Ligaregeln' : 'Pokalregeln'}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#8b92a5]">Saison</span>
          <input value={rules.season} onChange={(event) => setRules({ ...rules, season: event.target.value })} className="mt-2 w-full bg-[#000] border border-[#2e2e2e] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#ff5c3e]" />
        </label>
        {rules[activeType].map((rule, index) => (
          <div key={rule.id} className="border-t border-[#2e2e2e] pt-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#626978] mb-3">Regel {index + 1}</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label><span className="field-label">Abschnitt</span><input value={rule.section} onChange={(e) => updateRule(activeType, rule.id, 'section', e.target.value)} className="field-input" /></label>
              <label><span className="field-label">Titel</span><input value={rule.title} onChange={(e) => updateRule(activeType, rule.id, 'title', e.target.value)} className="field-input" /></label>
            </div>
            <label className="block mt-3"><span className="field-label">Beschreibung</span><textarea rows="3" value={rule.text} onChange={(e) => updateRule(activeType, rule.id, 'text', e.target.value)} className="field-input resize-y" /></label>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className={`text-xs ${status?.startsWith('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{status}</span>
          <button onClick={handleSave} className="bg-[#ff5c3e] text-white px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#ff7056] transition-colors">Regeln speichern</button>
        </div>
      </div>}
    </section>
  );
};


const AdminPanel = () => {
  const { isAdmin, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);

  const handleManualUpdate = async () => {
    const password = window.prompt("Bitte Admin-Passwort eingeben:");
    if (!password) return;

    setIsUpdating(true);
    setUpdateStatus("Update wird gestartet...");

    try {
      const res = await fetch(`/api/cron?secret=${encodeURIComponent(password)}`);
      if (res.ok) {
        setUpdateStatus("✅ Update erfolgreich angestoßen! Der Workflow läuft.");
        setTimeout(() => setUpdateStatus(null), 5000);
      } else {
        const errData = await res.json();
        setUpdateStatus(`❌ Fehler: ${errData.error || "Unbefugt"}`);
        setTimeout(() => setUpdateStatus(null), 5000);
      }
    } catch {
      setUpdateStatus("❌ Netzwerkfehler beim Update-Aufruf.");
      setTimeout(() => setUpdateStatus(null), 5000);
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
        <div className="text-center bg-[#171717] border border-[#2e2e2e] rounded-2xl p-8">
          <h1 className="text-lg font-black text-white uppercase mb-3">Kein Zugriff</h1>
          <p className="text-sm text-[#8b92a5] mb-6">Diese Seite ist nur für Admins.</p>
          <Link to="/" className="text-[#ff5c3e] text-sm font-bold uppercase tracking-widest">Zurück zum Ligasystem</Link>
        </div>
      </div>
    );
  }

  const setStatus = (id, status) => updateDoc(doc(db, 'users', id), { status });
  const setRole = (id, role) => updateDoc(doc(db, 'users', id), role === 'admin' ? { role, status: 'approved' } : { role });

  const filteredUsers = users.filter(u => filter === 'all' || (filter === 'admin' ? u.role === 'admin' : u.status === filter));
  const pendingCount = users.filter(u => u.status === 'pending').length;
  const adminCount = users.filter(u => u.role === 'admin').length;

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[10px] font-bold tracking-wider text-[#ff5c3e] mb-1">ADMIN</div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase text-white">Nutzerverwaltung</h1>
          </div>
          <Link
            to="/account"
            aria-label="Schließen"
            className="w-10 h-10 shrink-0 flex items-center justify-center bg-[#171717] border border-[#2e2e2e] rounded-xl text-[#8b92a5] hover:text-white hover:border-[#404040] transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </Link>
        </div>

        <PushNotificationCard />

        <div className="flex gap-2 mb-6 overflow-x-auto">
          {['pending', 'approved', 'admin', 'rejected', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${filter === f ? 'bg-[#ff5c3e] text-white' : 'bg-[#171717] border border-[#2e2e2e] text-[#8b92a5] hover:text-white'}`}
            >
              {f === 'pending' ? `Ausstehend (${pendingCount})` : f === 'approved' ? 'Freigegeben' : f === 'admin' ? `Admins (${adminCount})` : f === 'rejected' ? 'Abgelehnt' : 'Alle'}
            </button>
          ))}
        </div>

        <p className="text-xs text-[#8b92a5] mb-6 -mt-3">
          Mit <span className="text-purple-400 font-bold">„Zum Admin machen"</span> kannst du jede Person direkt zum Admin ernennen (wird dauerhaft im System gespeichert und automatisch freigeschaltet).
        </p>

        {loading ? (
          <div className="text-center text-[#8b92a5] text-sm py-10">Lade Nutzer...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center text-[#8b92a5] text-sm py-10">Keine Einträge in dieser Ansicht.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredUsers.map(u => (
              <div key={u.id} className="bg-[#171717] border border-[#2e2e2e] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#1f1f1f] flex items-center justify-center font-black text-[#ff5c3e] shrink-0">
                    {(u.displayName || u.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-gray-100 truncate flex items-center gap-2">
                      {u.displayName || 'Unbenannt'}
                      {u.role === 'admin' && <span className="text-[8px] font-black uppercase tracking-widest bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-full px-1.5 py-0.5">Admin</span>}
                      {u.id === user?.uid && <span className="text-[8px] font-black uppercase tracking-widest text-[#626978]">(Du)</span>}
                    </div>
                    <div className="text-xs text-[#8b92a5] truncate">{u.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={u.status} />

                  {u.status !== 'approved' && (
                    <button
                      onClick={() => setStatus(u.id, 'approved')}
                      className="text-[10px] font-black uppercase tracking-widest bg-green-500/10 text-green-400 border border-green-500/30 px-3 py-1.5 rounded-lg hover:bg-green-500/20 transition-colors"
                    >
                      Freigeben
                    </button>
                  )}
                  {u.status !== 'rejected' && (
                    <button
                      onClick={() => setStatus(u.id, 'rejected')}
                      className="text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
                    >
                      Ablehnen
                    </button>
                  )}
                  {u.id !== user?.uid && (
                    <button
                      onClick={() => setRole(u.id, u.role === 'admin' ? 'user' : 'admin')}
                      className="text-[10px] font-black uppercase tracking-widest bg-purple-500/10 text-purple-400 border border-purple-500/30 px-3 py-1.5 rounded-lg hover:bg-purple-500/20 transition-colors"
                    >
                      {u.role === 'admin' ? 'Admin entziehen' : 'Zum Admin machen'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Kickbase-Daten aktualisieren: bewusst ganz unten, als klar klickbarer
            Abschluss der Seite statt einer kleinen Kachel oben zwischen den Filtern. */}
        <div className="mt-10 pt-6 border-t border-[#2e2e2e]">
          <button
            onClick={handleManualUpdate}
            disabled={isUpdating}
            className="w-full flex items-center justify-center gap-2 bg-[#171717] border border-[#ff5c3e]/30 text-[#ff5c3e] font-black uppercase tracking-widest text-xs py-4 rounded-2xl hover:bg-[#ff5c3e]/10 hover:border-[#ff5c3e] transition-all disabled:opacity-50 shadow-lg"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            {updateStatus ? updateStatus : isUpdating ? 'Läuft...' : 'Kickbase-Daten jetzt aktualisieren'}
          </button>
          <p className="text-[10px] text-[#8b92a5] text-center mt-3">Stößt den GitHub-Actions-Workflow zum Abruf der Ligadaten manuell an.</p>
        </div>

        <RuleEditor />
      </div>
    </div>
  );
};

export default AdminPanel;
