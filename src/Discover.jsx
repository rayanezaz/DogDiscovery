import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Search, SlidersHorizontal, PawPrint, Heart, MapPin, X } from 'lucide-react';
import { api } from './api';
import { useStore } from './store';
import { Button, DogCard, Empty, Loading, Photo } from './components';

const initialFilters = { q:'',age:'',size:'',sex:'',location:'',sort:'featured' };
export function Discover({ saved = false, onOpen }) {
  const { user,ready,version,setAuthOpen } = useStore();
  const [filters,setFilters] = useState(initialFilters);
  const [dogs,setDogs] = useState([]); const [loading,setLoading] = useState(true); const [error,setError] = useState('');
  const [more,setMore] = useState(false);
  const update = (key,value) => setFilters(prev => ({ ...prev,[key]:value }));
  useEffect(() => {
    if (saved && !user) { setLoading(false); setDogs([]); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ ...filters,...(saved?{saved:'true'}:{}) });
      api(`/dogs?${query}`,{ signal:controller.signal }).then(x => setDogs(x.dogs)).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    },150);
    return () => { clearTimeout(timer); controller.abort(); };
  },[filters,saved,user,version]);
  const activeFilters = Object.entries(filters).filter(([k,v]) => k!=='sort' && v).length;
  return <>
    {!saved && <section className="hero wrap">
      <div className="hero-copy"><div className="eyebrow"><span/> A LITTLE DISCOVERY. A LIFETIME OF LOVE.</div><h1>Your next best<br/>friend is <em>out there.</em></h1><p>A hiking buddy. A couch companion. Your favorite hello.<br className="desktop-break"/> Find the dog who makes your world a little fuller.</p>
        <a href="#discover" className="button" onClick={e=>{e.preventDefault();document.getElementById('discover').scrollIntoView({behavior:'smooth'});}}>Find your best friend <ArrowUpRight size={19}/></a>
        <div className="hero-footnote"><div className="mini-paw"><PawPrint size={17}/></div><span>Good dogs. New beginnings. <strong>Endless possibilities.</strong></span></div>
      </div>
      <div className="hero-art"><div className="hero-orbit"/><div className="hero-photo"><Photo src="https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1100&q=90" alt="A golden retriever ready for a new adventure"/><div className="hero-photo-gradient"/><span className="hero-photo-label"><span>Meet Maple</span><small>Professional tail-wagger</small></span><button onClick={()=>onOpen(1)} aria-label="Meet Maple"><ArrowUpRight/></button></div><div className="hero-sticker"><Heart size={21}/><span>Love comes<br/>with four paws.</span></div><span className="hero-spark">✳</span><span className="hero-squiggle">⌁</span></div>
    </section>}
    <section id="discover" className="catalog wrap">
      <div className="section-heading"><div><div className="eyebrow">{saved ? 'A PLACE FOR YOUR FAVORITES' : 'SMALL MOMENTS. BIG CONNECTIONS.'}</div><h2>{saved ? 'A few dogs close to your heart.' : 'Someone wonderful is waiting.'}</h2><p>{saved ? 'Your saved companions, all in one happy place.' : 'Different personalities. Different stories. One thing in common: a whole lot of love.'}</p></div><PawPrint className="heading-paw" size={45}/></div>
      {saved && ready && !user ? <Empty title="Keep your favorites close." action={<Button onClick={()=>setAuthOpen(true)}>Sign in to see saved dogs</Button>}>Sign in to start your own little shortlist of best friends.</Empty> : <>
        <div className="search-bar"><div className="search-input"><Search size={20}/><input aria-label="Search dogs" placeholder="Search by name, breed, or city…" value={filters.q} onChange={e=>update('q',e.target.value)}/>{filters.q && <button className="icon-button" onClick={()=>update('q','')} aria-label="Clear search"><X size={17}/></button>}</div>
          <div className="location-filter"><MapPin size={18}/><select aria-label="Location" value={filters.location} onChange={e=>update('location',e.target.value)}><option value="">All locations</option><option>Portland</option><option>Seattle</option><option>Bend</option><option>Salem</option></select></div><button className={`filter-button ${more?'active':''}`} onClick={()=>setMore(!more)} aria-expanded={more}><SlidersHorizontal size={17}/> Filters{activeFilters > 0 && <b>{activeFilters}</b>}</button>
        </div>
        {more && <div className="extra-filters"><label>Size<select value={filters.size} onChange={e=>update('size',e.target.value)}><option value="">Any size</option>{['Small','Medium','Large'].map(x=><option key={x}>{x}</option>)}</select></label><label>Sex<select value={filters.sex} onChange={e=>update('sex',e.target.value)}><option value="">Any sex</option><option>Female</option><option>Male</option></select></label><label>City or region<input value={filters.location} placeholder="Anywhere" onChange={e=>update('location',e.target.value)}/></label><button className="text-link" onClick={()=>setFilters(initialFilters)}>Reset filters</button></div>}
        <div className="catalog-toolbar"><div className="age-filters">{[['','All dogs'],['puppy','Puppies'],['adult','Adults'],['senior','Seniors']].map(([value,label])=><button key={value} className={filters.age===value?'selected':''} aria-pressed={filters.age===value} onClick={()=>update('age',value)}>{value==='' && <PawPrint size={15}/>} {label}</button>)}</div><label className="sort-select">Sort by: <select aria-label="Sort dogs" value={filters.sort} onChange={e=>update('sort',e.target.value)}><option value="featured">Featured</option><option value="youngest">Youngest</option><option value="name">Name, A–Z</option></select></label></div>
        <div className="results-note" aria-live="polite">{loading?'Fetching friends…':`${dogs.length} ${dogs.length===1?'dog':'dogs'}${saved?' saved':' looking for their person'}`}{activeFilters>0 && <button onClick={()=>setFilters(initialFilters)}>Clear filters <X size={12}/></button>}</div>
        {loading ? <Loading/> : error ? <Empty title="We couldn’t load the dogs." action={<Button onClick={()=>setFilters({...filters})}>Try again</Button>}>{error}</Empty> : dogs.length ? <div className="dog-grid">{dogs.map(dog=><DogCard key={dog.id} dog={dog} onOpen={onOpen}/>)}</div> : <Empty title={saved?'Your next favorite is out there.':'No little faces here just yet.'} action={saved?<a className="button" href="#/">Discover dogs <ArrowRight size={17}/></a>:<Button onClick={()=>setFilters(initialFilters)}>Clear filters</Button>}>{saved?'Tap the heart on any dog to save them here.':'Try another location or a few fewer filters. Your friend might be just around the corner.'}</Empty>}
      </>}
    </section>
    {!saved && <section className="journey-banner wrap"><div className="journey-icon"><PawPrint size={46}/></div><div><div className="eyebrow">THERE’S A HOME FOR EVERY HEART</div><h2>A new beginning starts with you.</h2><p>Helping a dog find their people? Share their story with our community.</p></div><a href="#/profile" className="button light">List a dog <ArrowUpRight size={18}/></a></section>}
    <div className="demo-banner wrap">You’re exploring a demo. All listings and rescue profiles are sample data.</div>
  </>;
}
