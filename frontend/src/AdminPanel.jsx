import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc, deleteField, query, orderBy } from 'firebase/firestore';
import { Check, X, AlertTriangle, MoreVertical, MessageCircle, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import PushNotificationCard from './PushNotificationCard';
import AdminMessengerCard from './AdminMessengerCard';
import { useBackNavigation } from './useBackNavigation';
import PageHeader from './ui/PageHeader';
import CloseButton from './ui/CloseButton';
import StatusPill from './ui/StatusPill';

const STATUS_VARIANTS = { approved: 'green', pending: 'yellow', rejected: 'red' };
const STATUS_ICONS = { approved: CheckCircle2, pending: Clock, rejected: XCircle };
const STATUS_LABELS = { approved: 'Freigegeben', pending: 'Ausstehend', rejected: 'Abgelehnt' };

const StatusBadge = ({ status }) => (
  <StatusPill icon={STATUS_ICONS[status]} variant={STATUS_VARIANTS[status] || 'yellow'}>
    {STATUS_LABELS[status] || status}
  </StatusPill>
);

const MenuItem = ({ onClick, children, danger, accent }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-[#2a2a2a] transition-colors ${danger ? 'text-red-400' : accent ? 'text-purple-400' : 'text-gray-200'}`}
  >
    {children}
  </button>
);

const UserRow = ({ u, isSelf, onSetStatus, onSetRole, onApproveKickbaseChange, onRejectKickbaseChange, menuOpen, onToggleMenu, menuRef }) => {
  const isPending = u.status === 'pending';
  const changeRequest = u.kickbaseChangeRequest;

  return (
    <div className="flex flex-col gap-2">
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
        <div className="text-[11px] text-[#8b92a5] truncate">{u.email}</div>
        <div className="flex items-center gap-1 mt-1">
          {u.kickbaseId ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-green-400">
              <Check size={10} strokeWidth={4} className="shrink-0" />
              {u.kickbaseName || 'Verknüpft'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-yellow-500/80">
              <AlertTriangle size={10} strokeWidth={3} className="shrink-0" />
              Kickbase nicht verknüpft{u.kickbaseName ? ` (nur Name: "${u.kickbaseName}")` : ''}
            </span>
          )}
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
            <Check size={14} strokeWidth={3} />
          </button>
          <button
            onClick={() => onSetStatus(u.id, 'rejected')}
            aria-label="Ablehnen"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors"
          >
            <X size={14} strokeWidth={3} />
          </button>
        </div>
      ) : (
        <div className="relative shrink-0" ref={menuOpen ? menuRef : null}>
          <button
            onClick={() => onToggleMenu(u.id)}
            aria-label="Weitere Optionen"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#8b92a5] hover:text-white hover:bg-[#1f1f1f] transition-colors"
          >
            <MoreVertical size={16} strokeWidth={2.5} />
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

    {changeRequest && (
      <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-xl px-3.5 py-2.5 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] text-yellow-400 font-bold flex-1 min-w-0">
          Möchte wechseln: <span className="text-gray-300">{u.kickbaseName || '(kein Name)'}</span> → <span className="text-white">{changeRequest.requestedName}</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onApproveKickbaseChange(u.id, changeRequest)}
            className="px-2.5 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 transition-colors text-[10px] font-black uppercase tracking-widest"
          >
            Bestätigen
          </button>
          <button
            onClick={() => onRejectKickbaseChange(u.id)}
            className="px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors text-[10px] font-black uppercase tracking-widest"
          >
            Ablehnen
          </button>
        </div>
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
  const [updateStatusOk, setUpdateStatusOk] = useState(true);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [showMessenger, setShowMessenger] = useState(false);
  const menuRef = useRef(null);

  const handleManualUpdate = async () => {
    const password = window.prompt("Bitte Admin-Passwort eingeben:");
    if (!password) return;

    setIsUpdating(true);
    setUpdateStatus("Update wird gestartet...");

    try {
      // Bewusst per Authorization-Header statt Query-Parameter: Ein "?secret=..."
      // in der URL landet im Klartext im Browser-Netzwerk-Tab UND in Vercels
      // eigenen HTTP-Zugriffslogs (die volle URLs inkl. Query-String loggen) -
      // der Header wird dort nicht mitgeloggt.
      const res = await fetch('/api/cron', {
        headers: { Authorization: `Bearer ${password}` }
      });
      if (res.ok) {
        setUpdateStatus("Update erfolgreich angestoßen! Der Workflow läuft.");
        setUpdateStatusOk(true);
        setTimeout(() => setUpdateStatus(null), 5000);
      } else {
        const errData = await res.json();
        setUpdateStatus(`Fehler: ${errData.error || "Unbefugt"}`);
        setUpdateStatusOk(false);
        setTimeout(() => setUpdateStatus(null), 5000);
      }
    } catch {
      setUpdateStatus("Netzwerkfehler beim Update-Aufruf.");
      setUpdateStatusOk(false);
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

  // Bestätigt eine Kickbase-Änderungsanfrage: setzt den neuen Namen/ID und
  // löscht die Anfrage. Ablehnen löscht nur die Anfrage, der alte Name bleibt.
  const approveKickbaseChange = (id, changeRequest) => {
    updateDoc(doc(db, 'users', id), {
      kickbaseId: changeRequest.requestedId,
      kickbaseName: changeRequest.requestedName,
      kickbaseChangeRequest: deleteField(),
    });
  };
  const rejectKickbaseChange = (id) => {
    updateDoc(doc(db, 'users', id), { kickbaseChangeRequest: deleteField() });
  };

  const filteredUsers = users.filter(u => filter === 'all' || (filter === 'admin' ? u.role === 'admin' : filter === 'unlinked' ? !u.kickbaseId : filter === 'changeRequests' ? Boolean(u.kickbaseChangeRequest) : u.status === filter));
  const pendingCount = users.filter(u => u.status === 'pending').length;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const unlinkedCount = users.filter(u => !u.kickbaseId).length;
  const changeRequestsCount = users.filter(u => u.kickbaseChangeRequest).length;

  return (
    <div className="min-h-screen bg-[#000000] p-4 sm:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <PageHeader eyebrow="ADMIN" title="Nutzerverwaltung" />
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowMessenger(true)}
              aria-label="Messenger öffnen"
              className="w-10 h-10 flex items-center justify-center bg-[#171717] border border-[#2e2e2e] rounded-xl text-[#8b92a5] hover:text-white hover:border-[#404040] transition-all"
            >
              <MessageCircle size={18} strokeWidth={2.5} />
            </button>
            <CloseButton onClick={goBack} />
          </div>
        </div>

        <PushNotificationCard />

        {showMessenger && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowMessenger(false)}>
            <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-end mb-2">
                <CloseButton onClick={() => setShowMessenger(false)} size="compact" />
              </div>
              <AdminMessengerCard />
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-6 overflow-x-auto">
          {['pending', 'approved', 'admin', 'unlinked', 'changeRequests', 'rejected', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${filter === f ? 'bg-[#ff5c3e] text-white' : 'bg-[#171717] border border-[#2e2e2e] text-[#8b92a5] hover:text-white'}`}
            >
              {f === 'pending' ? `Ausstehend (${pendingCount})` : f === 'approved' ? 'Freigegeben' : f === 'admin' ? `Admins (${adminCount})` : f === 'unlinked' ? `Nicht verknüpft (${unlinkedCount})` : f === 'changeRequests' ? `Änderungsanfragen (${changeRequestsCount})` : f === 'rejected' ? 'Abgelehnt' : 'Alle'}
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
                onApproveKickbaseChange={approveKickbaseChange}
                onRejectKickbaseChange={rejectKickbaseChange}
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
            {updateStatus ? (
              updateStatusOk ? <CheckCircle2 size={16} strokeWidth={2.5} className="text-green-400" /> : <XCircle size={16} strokeWidth={2.5} className="text-red-400" />
            ) : (
              <RefreshCw size={16} strokeWidth={2.5} className={isUpdating ? 'animate-spin' : ''} />
            )}
            <span className={updateStatus ? (updateStatusOk ? 'text-green-400' : 'text-red-400') : ''}>
              {updateStatus ? updateStatus : isUpdating ? 'Läuft...' : 'Kickbase-Daten jetzt aktualisieren'}
            </span>
          </button>
          <p className="text-[10px] text-[#8b92a5] text-center mt-3">Stößt den GitHub-Actions-Workflow zum Abruf der Ligadaten manuell an.</p>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
