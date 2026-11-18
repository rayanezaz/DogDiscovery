import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';
const Context = createContext(null);
export function Store({ children }) {
  const [user,setUser] = useState(null);
  const [ready,setReady] = useState(false);
  const [favorites,setFavorites] = useState([]);
  const [version,setVersion] = useState(0);
  const [authOpen,setAuthOpen] = useState(false);
  const [toast,setToast] = useState(null);
  const refresh = useCallback(() => setVersion(x => x+1), []);
  const notify = useCallback((message, error = false) => setToast({ message, error }), []);
  useEffect(() => {
    let active=true;
    const params=new URLSearchParams(location.search);
    const failure=params.get('auth_error');
    const success=params.has('auth_success');
    if(failure || success) {
      params.delete('auth_error');params.delete('auth_success');
      const query=params.toString();
      history.replaceState(null,'',location.pathname+(query?`?${query}`:'')+location.hash);
      if(failure) {
        const message=failure==='cancelled'?'Sign-in was cancelled. You can try again whenever you’re ready.':failure==='expired'?'That sign-in link expired or was opened in a different browser. Please start again.':'We couldn’t complete sign-in. Please try again.';
        notify(message,true);setAuthOpen(true);
      } else notify('You’re signed in. Welcome to Dog Discovery!');
    }
    const load=()=>api('/auth/me').then(x=>{if(active)setUser(x.user);}).catch(e=>{if(active)notify(e.message,true);}).finally(()=>{if(active)setReady(true);});
    load();
    const onVisible=()=>{if(document.visibilityState==='visible')load();};
    document.addEventListener('visibilitychange',onVisible);
    return()=>{active=false;document.removeEventListener('visibilitychange',onVisible);};
  },[notify]);
  useEffect(() => { let active = true; if (!user) { setFavorites([]); return; } api('/favorites').then(x => { if (active) setFavorites(x.favorites); }).catch(e => notify(e.message,true)); return () => { active = false; }; },[user,version,notify]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null),4500); return () => clearTimeout(timer); },[toast]);
  const authenticate = user => { setUser(user); setAuthOpen(false); refresh(); };
  const requireUser = () => { if (user) return true; setAuthOpen(true); return false; };
  async function favorite(dogId) {
    if (!requireUser()) return;
    try {
      const saved = favorites.includes(dogId);
      await api(`/favorites/${dogId}`,{ method: saved ? 'DELETE' : 'PUT' });
      setFavorites(prev => saved ? prev.filter(x => x !== dogId) : [...new Set([...prev,dogId])]);
      refresh();
      notify(saved ? 'Removed from your saved dogs.' : 'A little love, saved for later.');
    } catch (e) { notify(e.message,true); }
  }
  async function signOut() { try { await api('/auth/logout',{ method:'POST' }); setUser(null); refresh(); location.hash = '/'; notify('You have been signed out.'); } catch(e) { notify(e.message,true); } }
  return <Context.Provider value={{ user,setUser,ready,favorites,favorite,version,refresh,authOpen,setAuthOpen,authenticate,requireUser,notify,signOut }}>
    {children}{toast && <div role="status" className={`toast ${toast.error ? 'error' : ''}`}>{toast.message}<button onClick={() => setToast(null)} aria-label="Dismiss notification">×</button></div>}
  </Context.Provider>;
}
export const useStore = () => useContext(Context);
