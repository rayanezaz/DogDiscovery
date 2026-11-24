import React, { useEffect, useState } from 'react';
import {Heart, MapPin, MessageCircle, ArrowUpRight, ShieldCheck, PawPrint} from 'lucide-react';
import { api } from './api';
import { useStore } from './store';
import { Modal, Button, Photo, Loading, ageLabel, Field } from './components';

export function DogDetail({ dogId,onClose,onEdit }) {
  const { user,favorites,favorite,requireUser,notify,refresh,version } = useStore();
  const [dog,setDog] = useState(null); const [error,setError] = useState('');
  const [photo,setPhoto] = useState(0); const [mode,setMode] = useState(null); const [busy,setBusy] = useState(false);
  useEffect(()=>{ let active=true; api(`/dogs/${dogId}`).then(x=>{if(active)setDog(x.dog);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;}; },[dogId,version]);
  async function submit(e) {
    e.preventDefault(); if(!requireUser()) return;
    const content = new FormData(e.currentTarget).get('content'); setBusy(true);setError('');
    try {
      if(mode==='apply') { await api(`/dogs/${dogId}/adoptions`,{method:'POST',body:{note:content}}); notify('Your introduction is on its way. Track it in your profile.'); refresh();setMode(null); }
      else { const result=await api('/conversations',{method:'POST',body:{dog_id:dogId,body:content}});onClose();location.hash=`/messages/${result.conversation.id}`;notify('Message sent. A new connection begins!'); }
    } catch(e) {setError(e.message);} finally{setBusy(false);}
  }
  return <Modal title={dog?`Meet ${dog.name}`:'A new friend…'} onClose={onClose} wide>
    {!dog ? error?<p className="form-error">{error}</p>:<Loading/> : <div className="detail-layout"><div className="detail-gallery"><Photo className="detail-photo" src={dog.images[photo] || dog.images[0]} alt={dog.name}/>{dog.images.length>1 && <div className="thumbnails">{dog.images.map((src,i)=><button key={src} className={i===photo?'active':''} onClick={()=>setPhoto(i)} aria-label={`Photo ${i+1} of ${dog.name}`}><Photo src={src} alt={`${dog.name} photo ${i+1}`}/></button>)}</div>}<div className="detail-rescue"><PawPrint size={24}/><div><strong>{dog.owner_name}</strong><span>{dog.owner_bio || 'Helping a good dog find a loving home.'}</span></div></div></div>
      <div className="detail-copy"><span className="status-pill">{dog.status==='available'?'Looking for my person':dog.status==='adopted'?'Found a forever home':'Taking a little break'}</span><div className="detail-title"><h3>{dog.name}</h3><button className={`icon-button ${favorites.includes(dog.id)?'is-saved':''}`} aria-label="Save this dog" onClick={()=>favorite(dog.id)}><Heart fill={favorites.includes(dog.id)?'currentColor':'none'}/></button></div><p className="breed-line">{dog.breed}</p><p className="location-line"><MapPin size={15}/>{dog.location}</p>
        <div className="detail-facts"><div><span>Age</span><strong>{ageLabel(dog.age_months)}</strong></div><div><span>Size</span><strong>{dog.size}</strong></div><div><span>Sex</span><strong>{dog.sex}</strong></div></div>
        <h4>A little about me</h4><p className="dog-story">{dog.description}</p><div className="trait-list">{dog.traits.map(x=><span key={x}>{x}</span>)}</div>
        {user?.id===dog.owner_id ? <Button className="full-width" disabled={dog.status==='adopted'} onClick={()=>{onClose();onEdit(dog);}}>Manage listing <ArrowUpRight size={17}/></Button> : !mode ? <div className="detail-actions"><Button disabled={dog.status!=='available'} onClick={()=>{if(requireUser())setMode('apply');}}>I’d love to meet {dog.name} <ArrowUpRight size={17}/></Button><Button className="secondary" onClick={()=>{if(requireUser())setMode('message');}}><MessageCircle size={17}/> Ask a question</Button></div> : <form className="form-stack detail-form" onSubmit={submit}><Field label={mode==='apply'?`Tell ${dog.owner_name} about your home and lifestyle`:'Say hello or ask a question'}><textarea name="content" rows={4} minLength={mode==='apply'?20:1} maxLength={2000} required placeholder={mode==='apply'?'A little about me and the home I can offer…':'Hi! I’d love to know more…'}/></Field><div className="form-actions"><Button loading={busy}>{mode==='apply'?'Send introduction':'Send message'}</Button><button type="button" className="text-link" onClick={()=>{setMode(null);setError('');}}>Cancel</button></div></form>}
        {error && <p className="form-error" role="alert">{error}</p>}<p className="detail-hint"><ShieldCheck size={16}/> An introduction is the first step, not a commitment.</p>
      </div></div>}
  </Modal>;
}
