import React, { useEffect, useRef, useState } from 'react';
import { X, Heart, MapPin, ArrowUpRight, Upload, PawPrint, LoaderCircle, ImagePlus, Github, MailCheck } from 'lucide-react';
import { api } from './api';
import { useStore } from './store';

export const ageLabel = months => months < 12 ? `${months} month${months === 1 ? '' : 's'}` : `${Math.floor(months/12)} year${Math.floor(months/12) === 1 ? '' : 's'}`;
export function Photo({ src, alt, ...props }) {
  const [failed,setFailed] = useState(false);
  useEffect(() => setFailed(false),[src]);
  return failed || !src ? <div className={`photo-placeholder ${props.className || ''}`} role="img" aria-label={alt}><PawPrint size={48}/><span>{alt}</span></div> : <img src={src} alt={alt} onError={() => setFailed(true)} {...props}/>;
}
export function Button({ children, loading, className = '', ...props }) { return <button className={`button ${className}`} disabled={loading || props.disabled} {...props}>{loading && <LoaderCircle size={17} className="spin"/>}{children}</button>; }
export function Field({ label, children, ...props }) { return <label className="field"><span>{label}</span>{children || <input {...props}/>}</label>; }
export function Empty({ title, children, action }) { return <div className="empty"><div className="empty-icon"><PawPrint size={30}/></div><h2>{title}</h2><p>{children}</p>{action}</div>; }
export function Loading() { return <div className="loading" role="status"><LoaderCircle className="spin"/> Finding the good stuff…</div>; }
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current; dialog.showModal();
    const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = old; previous?.focus(); };
  },[]);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) onClose(); } }} aria-label={title}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X/></button></div>{children}
  </dialog>;
}
export function DogCard({ dog, onOpen, onEdit }) {
  const { favorites,favorite } = useStore();
  const [saving,setSaving] = useState(false);
  const saved = favorites.includes(dog.id);
  return <article className="dog-card">
    <div className="dog-photo"><button className="photo-link" onClick={() => onOpen(dog.id)} aria-label={`Meet ${dog.name}`}><Photo src={dog.images[0]} alt={dog.name} loading="lazy"/></button>
      <span className={`photo-tag ${dog.status !== 'available' ? 'muted' : ''}`}>{dog.status === 'available' ? dog.age_months < 12 ? 'Puppy love' : dog.age_months >= 84 ? 'Golden years' : 'Ready for love' : dog.status}</span>
      <button className={`save-button ${saved ? 'saved' : ''}`} aria-label={`${saved ? 'Unsave' : 'Save'} ${dog.name}`} aria-pressed={saved} disabled={saving} onClick={async () => { setSaving(true); await favorite(dog.id); setSaving(false); }}><Heart size={19} fill={saved ? 'currentColor' : 'none'}/></button>
    </div>
    <div className="dog-info"><div className="dog-title"><button onClick={() => onOpen(dog.id)}>{dog.name}</button><span>{dog.sex === 'Female' ? '♀' : '♂'}</span></div>
      <p>{dog.breed}</p><div className="dog-facts"><span>{ageLabel(dog.age_months)}</span><i/> <span>{dog.size}</span></div>
      <div className="dog-bottom"><span><MapPin size={14}/>{dog.location}</span><button onClick={() => onEdit ? onEdit(dog) : onOpen(dog.id)} aria-label={onEdit ? `Manage ${dog.name}` : `Meet ${dog.name}`}>{onEdit ? 'Manage' : <ArrowUpRight size={20}/>}</button></div>
    </div>
  </article>;
}
export function ImageUpload({ images, onChange, single = false }) {
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  async function upload(e) {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    if (!single && files.length + images.length > 5) { setError('Choose up to 5 photos in total.'); return; }
    setBusy(true); setError('');
    const result = single ? [] : [...images];
    try {
      for (const file of files) {
        if (file.size > 5*1024*1024) throw new Error('Each photo must be under 5 MB.');
        const body = new FormData(); body.append('image',file);
        const data = await api('/images',{ method:'POST',body }); result.push(data.url);
      }
    } catch (e) { setError(e.message); }
    finally { onChange(result); setBusy(false); }
  }
  return <div className="upload-block"><div className="upload-previews">{images.map((src,i) => <div key={src}><Photo src={src} alt={`Uploaded photo ${i+1}`}/><button type="button" onClick={() => onChange(images.filter(x=>x!==src))} aria-label={`Remove photo ${i+1}`}><X size={14}/></button></div>)}</div>
    {(single || images.length < 5) && <label className={`upload-zone ${busy ? 'disabled' : ''}`}>{busy ? <LoaderCircle className="spin"/> : <ImagePlus/>}<strong>{busy ? 'Uploading your photo…' : single ? 'Choose a profile photo' : 'Add a little personality'}</strong><span>{single ? 'Upload a photo' : 'Upload 1–5 photos'} · JPG, PNG or WebP · 5 MB each</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple={!single} disabled={busy} onChange={upload}/></label>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
export function AuthModal() {
  const { authOpen,setAuthOpen,authenticate } = useStore();
  const [mode,setMode] = useState('login');
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const [config,setConfig] = useState(null); const [confirmation,setConfirmation] = useState(false);
  useEffect(() => {
    if(!authOpen) return;
    let active=true;setError('');setConfirmation(false);setBusy(false);setConfig(null);
    api('/auth/config').then(data=>{if(active)setConfig(data);}).catch(()=>{if(active)setError('Sign-in is temporarily unavailable. Please try again shortly.');});
    return()=>{active=false;};
  },[authOpen]);
  if (!authOpen) return null;
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const data = await api(`/auth/${mode}`,{ method:'POST',body });
      if(data.confirmationRequired) setConfirmation(true);
      else authenticate(data.user);
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  async function oauth(provider) {
    setBusy(provider);setError('');
    try {
      const data=await api(`/auth/oauth/${provider}`,{method:'POST'});
      window.location.assign(data.url);
    } catch(e) {setError(e.message);setBusy(false);}
  }
  return <Modal title={confirmation ? 'A little hello in your inbox.' : mode === 'login' ? 'Welcome back, dog person.' : 'Your next chapter starts here.'} onClose={() => setAuthOpen(false)}>
    {confirmation ? <div className="auth-confirmation"><MailCheck size={42}/><h3>Check your email</h3><p>Open the confirmation link in this browser to finish creating your account. Then you can start meeting your new best friend.</p><Button className="secondary" onClick={()=>{setConfirmation(false);setMode('login');}}>Back to sign in</Button></div> : <>
      <p className="muted-text">Save your favorites, say hello, and find your forever friend.</p>
      <div className="oauth-buttons">{(config?.providers || ['google','github']).map(provider=><button key={provider} className="button secondary oauth-button" disabled={Boolean(busy) || !config?.configured} onClick={()=>oauth(provider)}>
        {busy===provider ? <LoaderCircle size={18} className="spin"/> : provider==='github' ? <Github size={19}/> : <span className="google-mark" aria-hidden="true">G</span>}
        Continue with {provider==='google'?'Google':'GitHub'}
      </button>)}</div>
      <div className="auth-divider"><span>or use your email</span></div>
      <form onSubmit={submit} className="form-stack">
        {mode === 'register' && <Field label="Your name" name="name" autoComplete="name" required minLength={2} maxLength={80}/>}
        <Field label="Email address" type="email" name="email" autoComplete="email" required placeholder="you@example.com"/>
        <Field label="Password" type="password" name="password" autoComplete={mode==='register' ? 'new-password' : 'current-password'} required minLength={mode==='register'?8:1} maxLength={128}/>
        {mode==='register' && <p className="auth-help">Use at least 8 characters. We’ll email you a confirmation link.</p>}
        <Button loading={busy===true} disabled={Boolean(busy) || !config?.configured}>{mode==='login'?'Sign in':'Create account'}<ArrowUpRight size={18}/></Button>
      </form>
      <p className="auth-switch">{mode==='login'?'New around here?':'Already a dog person?'} <button disabled={Boolean(busy)} onClick={() => { setMode(mode==='login'?'register':'login'); setError(''); }}>{mode==='login'?'Create an account':'Sign in'}</button></p>
      <p className="auth-help auth-security">Your sign-in is securely managed by Supabase.</p>
    </>}
    {(error || config?.configured===false) && <p className="form-error" role="alert">{error || 'Sign-in is temporarily unavailable. Please try again shortly.'}</p>}
  </Modal>;
}
