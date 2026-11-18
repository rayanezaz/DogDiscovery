import React, { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { api } from './api';
import { useStore } from './store';
import { Modal, Button, Field, ImageUpload } from './components';
export function ListingEditor({ dog,onClose }) {
  const { user,refresh,notify } = useStore();
  const [images,setImages] = useState(dog?.images || []); const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function submit(e) {
    e.preventDefault();setBusy(true);setError('');
    const body = {...Object.fromEntries(new FormData(e.currentTarget)),images};
    body.traits=body.traits.split(',').map(x=>x.trim()).filter(Boolean);
    try {await api(dog?`/dogs/${dog.id}`:'/dogs',{method:dog?'PUT':'POST',body});refresh();notify(dog?'Listing updated.':'A new story is ready to be discovered.');onClose();}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <Modal title={dog?`Edit ${dog.name}’s story`:'Every good dog has a story.'} onClose={onClose} wide><p className="muted-text">Help their future family get to know them. A little detail goes a long way.</p><form className="form-stack" onSubmit={submit}><ImageUpload images={images} onChange={setImages}/><div className="form-grid"><Field label="Dog’s name" name="name" defaultValue={dog?.name} required maxLength={60}/><Field label="Breed or mix" name="breed" defaultValue={dog?.breed} required minLength={2} maxLength={80}/><Field label="Age in months" name="age_months" type="number" min={0} max={360} defaultValue={dog?.age_months} required/><Field label="Size"><select name="size" defaultValue={dog?.size || 'Medium'}><option>Small</option><option>Medium</option><option>Large</option></select></Field><Field label="Sex"><select name="sex" defaultValue={dog?.sex || 'Female'}><option>Female</option><option>Male</option></select></Field><Field label="City, state" name="location" defaultValue={dog?.location || user.location} placeholder="Portland, OR" minLength={2} maxLength={100} required/></div><Field label="Their story"><textarea name="description" rows={4} defaultValue={dog?.description} minLength={20} maxLength={4000} placeholder="What makes them wonderful? What kind of home would help them thrive?" required/></Field><Field label="Personality traits (comma-separated, up to 6)" name="traits" defaultValue={dog?.traits.join(', ')} placeholder="Playful, Gentle soul, Good with kids"/><Field label="Listing visibility"><select name="status" defaultValue={dog?.status || 'available'}><option value="available">Available — ready to meet adopters</option><option value="paused">Paused — hidden from discovery</option></select></Field>{error && <p role="alert" className="form-error">{error}</p>}<div className="form-actions"><Button loading={busy}>{dog?'Save changes':'Publish listing'}<ArrowUpRight size={18}/></Button><button type="button" className="text-link" onClick={onClose}>Cancel</button></div></form></Modal>;
}
