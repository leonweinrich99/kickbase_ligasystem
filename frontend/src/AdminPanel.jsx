import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';

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

const AdminPanel = () => {
  const { isAdmin, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

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
      <div className="min-h-screen bg-[#0f1115] flex items-center justify-center p-4">
        <div className="text-center bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-8">
          <h1 className="text-lg font-black text-white uppercase mb-3">Kein Zugriff</h1>
          <p className="text-sm text-[#8b92a5] mb-6">Diese Seite ist nur für Admins.</p>
          <Link to="/" className="text-[#ff5c3e] text-sm font-bold uppercase tracking-widest">Zurück zum Ligasystem</Link>
        </div>
      </div>
    );
  }

  const setStatus = (id, status) => updateDoc(doc(db, 'users', id), { status });
  const setRole = (id, role) => updateDoc(doc(db, 'users', id), { role });

  const filteredUsers = users.filter(u => filter === 'all' || u.status === filter);
  const pendingCount = users.filter(u => u.status === 'pending').length;

  return (
    <div className="min-h-screen bg-[#0f1115] p-4 sm:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[10px] font-bold tracking-wider text-[#ff5c3e] mb-1">ADMIN</div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase text-white">Nutzerverwaltung</h1>
          </div>
          <Link to="/" className="bg-[#1a1d24] border border-[#2a2e37] px-4 py-2 rounded-xl text-[#8b92a5] hover:text-white transition-all text-xs font-bold uppercase tracking-wider">
            Zurück
          </Link>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto">
          {['pending', 'approved', 'rejected', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${filter === f ? 'bg-[#ff5c3e] text-white' : 'bg-[#1a1d24] border border-[#2a2e37] text-[#8b92a5] hover:text-white'}`}
            >
              {f === 'pending' ? `Ausstehend (${pendingCount})` : f === 'approved' ? 'Freigegeben' : f === 'rejected' ? 'Abgelehnt' : 'Alle'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-[#8b92a5] text-sm py-10">Lade Nutzer...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center text-[#8b92a5] text-sm py-10">Keine Einträge in dieser Ansicht.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredUsers.map(u => (
              <div key={u.id} className="bg-[#1a1d24] border border-[#2a2e37] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#20242d] flex items-center justify-center font-black text-[#ff5c3e] shrink-0">
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
      </div>
    </div>
  );
};

export default AdminPanel;
