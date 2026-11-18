import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PawPrint, Heart, MessageCircle, UserRound, ArrowUpRight, Menu, X, ArrowRight } from 'lucide-react';
import { Store,useStore } from './store';
import { AuthModal, Modal } from './components';
import { Discover } from './Discover';
import { DogDetail } from './DogDetail';
import { ListingEditor } from './ListingEditor';
import { Profile } from './Profile';
import { Messages } from './Messages';
import './styles.css';

function App() {
  const { user,favorites,setAuthOpen,requireUser }=useStore();
  const [path,setPath]=useState(location.hash.slice(1)||'/');const [dogId,setDogId]=useState(null);const [editor,setEditor]=useState(null);const [menu,setMenu]=useState(false);const [guide,setGuide]=useState(false);
  useEffect(()=>{const change=()=>{setPath(location.hash.slice(1)||'/');setDogId(null);setMenu(false);window.scrollTo(0,0);};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  const page=path.split('/')[1];
  const onEdit=dog=>setEditor({dog});const onCreate=()=>{if(requireUser())setEditor({dog:null});};
  return <><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content').focus();}}>Skip to content</a><header className="site-header"><div className="wrap header-inner"><a href="#/" className="brand" aria-label="Dog Discovery home"><span className="brand-icon"><PawPrint size={24} fill="currentColor"/></span><span>dog<span className="brand-light">discovery</span><small>GOOD DOGS. GREAT BEGINNINGS.</small></span></a><button className="menu-toggle icon-button" onClick={()=>setMenu(!menu)} aria-label="Toggle navigation" aria-expanded={menu}>{menu?<X/>:<Menu/>}</button><nav className={menu?'open':''} aria-label="Main navigation"><a className={!page?'active':''} href="#/">Discover dogs</a><a className={page==='saved'?'active':''} href="#/saved"><Heart size={16}/> Saved{favorites.length>0 && <b>{favorites.length}</b>}</a><a className={page==='messages'?'active':''} href="#/messages"><MessageCircle size={16}/> Messages</a><button onClick={()=>{setGuide(true);setMenu(false);}}>How it works</button></nav>{user?<a href="#/profile" className="account-button"><span>{user.name.slice(0,1)}</span> My account</a>:<button className="button header-signin" onClick={()=>setAuthOpen(true)}>Sign in <ArrowUpRight size={16}/></button>}</div></header>
    <div id="main-content" tabIndex={-1}>{page==='profile'?<Profile onOpen={setDogId} onEdit={onEdit} onCreate={onCreate}/>:page==='messages'?<Messages selected={path.split('/')[2]} onOpen={setDogId}/>:<main><Discover key={page==='saved'?'saved':'discover'} saved={page==='saved'} onOpen={setDogId}/></main>}</div>
    <footer className="site-footer wrap"><a href="#/" className="footer-brand"><PawPrint size={20}/> dogdiscovery</a><p>For the love of dogs. And the people who love them.</p><span>Made for new beginnings ♡</span></footer>
    {dogId && <DogDetail dogId={dogId} onClose={()=>setDogId(null)} onEdit={onEdit}/>}{editor && <ListingEditor dog={editor.dog} onClose={()=>setEditor(null)}/>}<AuthModal/>
    {guide && <Modal title="A little discovery. A whole lot of love." onClose={()=>setGuide(false)}><div className="how-steps">{[['01','Find your kind of friend','Explore by age, size, or location. Read their story and save the dogs who make your heart do a little thing.'],['02','Start with a hello','Ask the carer a question, or send an introduction about your home and lifestyle. Follow the conversation in Messages.'],['03','Make a new beginning','Arrange a meeting directly with the carer. When you both feel ready, the listing owner can accept your request and mark the adoption complete.']].map(([n,t,d])=><div key={n}><span>{n}</span><div><h3>{t}</h3><p>{d}</p></div></div>)}</div><button className="button full-width" onClick={()=>{setGuide(false);location.hash='/';}}>Let’s find your friend <ArrowRight size={17}/></button></Modal>}
  </>;
}
class ErrorBoundary extends React.Component {
  state={error:false};
  static getDerivedStateFromError(){return {error:true};}
  render(){return this.state.error?<div className="empty"><PawPrint size={36}/><h1>We hit a little bump.</h1><p>Reload the page to get back to your discovery.</p><button className="button" onClick={()=>location.reload()}>Reload page</button></div>:this.props.children;}
}
createRoot(document.getElementById('root')).render(<React.StrictMode><ErrorBoundary><Store><App/></Store></ErrorBoundary></React.StrictMode>);
