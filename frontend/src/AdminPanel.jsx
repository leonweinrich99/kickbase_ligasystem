import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import PushNotificationCard from './PushNotificationCard';
import { useBackNavigation } from './useBackNavigation';

const StatusBadge = ({ status }) => {
  const styles = {
    approved: 'bg-green-500/10 text-green-400 border-green-500/30',
    pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/30'
  };
  const labels = { approved: 'Freigegeben', pending: 'Ausstehend', rejected: 'Abgelehnt' };
  return (
    <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border shrink-0 ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  );
};

const MenuItem = ({ onClick, children, danger, accent }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-[#2a2a2a] transition-colors ${danger ? 'text-red-400' : accent ? 'text-purple-400' : 'text-gray-200'}`}
  >
    {children}
  </button>
);

const UserRow = ({ u, isSelf, onSetStatus, onSetRole, menuOpen, onToggleMenu, menuRef }) => {
  const isPending = u.status === 'pending';

  return (
    <div className="bg-[#171717] border border-[#2e2e2e] rounded-xl px-3.5 py-2.5 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-[#1f1f1f] flex items-center justify-center font-black text-[#ff5c3e] text-xs shrink-0">
        {(u.displayName || u.email || '?').charAt(0).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-[13px] text-gray-100 truncate">{u.displayName || 'Unbenannt'}</span>
          {u.role === 'admin' && <span className="text-[7px] font-black uppercase tracking-widest bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-full px-1.5 py-0.5 shrink-0">Admin</span>}
          {isSelf && <span className="text-[8px] font-bold text-[#626978] uppercase shrink-0">(Du)</span>}
        </div>
        <div className="text-[11px] text-[#8b92a5] truncate">
          {u.email}{u.kickbaseName ? ` · ${u.kickbaseName}` : ''}
        </div>
      </div>

      <StatusBadge status={u.status} />

      {isPending ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onSetStatus(u.id, 'approved')}
            aria-label="Freigeben"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
          <button
            onClick={() => onSetStatus(u.id, 'rejected')}
            aria-label="Ablehnen"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      ) : (
        <div className="relative shrink-0" ref={menuOpen ? menuRef : null}>
          <button
            onClick={() => onToggleMenu(u.id)}
            aria-label="Weitere Optionen"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#8b92a5] hover:text-white hover:bg-[#1f1f1f] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-[#1f1f1f] border border-[#2e2e2e] rounded-xl shadow-2xl z-20 overflow-hidden py-1">
              {u.status !== 'approved' && <MenuItem onClick={() => onSetStatus(u.id, 'approved')}>Freigeben</MenuItem>}
              {u.status !== 'rejected' && <MenuItem danger onClick={() => onSetStatus(u.id, 'rejected')}>Ablehnen</MenuItem>}
              {!isSelf && (
                <MenuItem accent onClick={() => onSetRole(u.id, u.role === 'admin' ? 'user' : 'admin')}>
                  {u.role === 'admin' ? 'Admin entziehen' : 'Zum Admin machen'}
                </MenuItem>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AdminPanel = () => {
  const { isAdmin, user } = useAuth();
  const goBack = useBackNavigation('/account');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

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

  // Offenes 3-Punkte-Menü schliessen, wenn irgendwo ausserhalb geklickt wird.
  useEffect(() => {
    if (!openMenuId) return;
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

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

  const setStatus = (id, status) => {
    updateDoc(doc(db, 'users', id), { status });
    setOpenMenuId(null);
  };
  const setRole = (id, role) => {
    updateDoc(doc(db, 'users', id), role === 'admin' ? { role, status: 'approved' } : { role });
    setOpenMenuId(null);
  };

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
          <button
            onClick={goBack}
            aria-label="Schließen"
            className="w-10 h-10 shrink-0 flex items-center justify-center bg-[#171717] border border-[#2e2e2e] rounded-xl text-[#8b92a5] hover:text-white hover:border-[#404040] transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
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

        {loading ? (
          <div className="text-center text-[#8b92a5] text-sm py-10">Lade Nutzer...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center text-[#8b92a5] text-sm py-10">Keine Einträge in dieser Ansicht.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredUsers.map(u => (
              <UserRow
                key={u.id}
                u={u}
                isSelf={u.id === user?.uid}
                onSetStatus={setStatus}
                onSetRole={setRole}
                menuOpen={openMenuId === u.id}
                onToggleMenu={(id) => setOpenMenuId((current) => (current === id ? null : id))}
                menuRef={menuRef}
              />
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
      </div>
    </div>
  );
};

export default AdminPanel;
