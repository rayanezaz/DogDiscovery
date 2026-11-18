import React, { useEffect, useRef, useState } from 'react';
import { Send, MessageCircle, ArrowLeft } from 'lucide-react';
import { api } from './api';
import { useStore } from './store';
import { Button, Empty, Photo, Loading } from './components';
export function Messages({ selected,onOpen }) {
  const { user,ready,setAuthOpen,notify }=useStore();
  const [conversations,setConversations]=useState([]);const [messages,setMessages]=useState([]);const [text,setText]=useState('');
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const end=useRef(null); const activeId=useRef(selected); activeId.current=selected;
  useEffect(()=>{
    if(!user){setLoading(false);return;} let active=true;setLoading(true);setError('');setMessages([]);setText('');
    async function load(){try{const list=await api('/conversations');const result=selected?await api(`/conversations/${selected}/messages`):null;if(active){setConversations(list.conversations);setMessages(result?.messages||[]);setError('');}}catch(e){if(active)setError(e.message);}finally{if(active)setLoading(false);}}
    load();const timer=setInterval(()=>{if(document.visibilityState==='visible')load();},5000);return()=>{active=false;clearInterval(timer);};
  },[user,selected]);
  useEffect(()=>{end.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[messages.length]);
  const current=conversations.find(x=>x.id===Number(selected));
  async function send(e){e.preventDefault();if(!text.trim()||!current)return;const target=selected;setBusy(true);try{await api(`/conversations/${target}/messages`,{method:'POST',body:{body:text}});const result=await api(`/conversations/${target}/messages`);if(activeId.current===target){setText('');setMessages(result.messages);} }catch(e){notify(e.message,true);}finally{setBusy(false);}}
  if(!ready)return <Loading/>;
  return <main className="wrap messages-page"><div className="section-heading"><div><div className="eyebrow">A GOOD CONNECTION STARTS WITH HELLO</div><h1>Your conversations.</h1><p>Get to know the people behind those happy little faces.</p></div><MessageCircle className="heading-paw" size={40}/></div>
    {!user?<Empty title="Say hello to a new beginning." action={<Button onClick={()=>setAuthOpen(true)}>Sign in to your messages</Button>}>Your private conversations with adopters and carers live here.</Empty>:loading?<Loading/>:error?<Empty title="We couldn’t open this conversation.">{error}</Empty>:conversations.length?<div className={`inbox ${selected?'has-selection':''}`}><aside className="conversation-list">{conversations.map(c=><a href={`#/messages/${c.id}`} key={c.id} className={c.id===Number(selected)?'active':''}><Photo src={c.image} alt={c.dog_name}/><div><strong>{c.participant}</strong><span>About {c.dog_name}</span><p>{c.last_message}</p></div></a>)}</aside><section className="conversation">{current?<><header><a href="#/messages" className="mobile-back" aria-label="Back to conversations"><ArrowLeft size={20}/></a><Photo src={current.image} alt={current.dog_name}/><div><strong>{current.participant}</strong><button onClick={()=>onOpen(current.dog_id)}>About {current.dog_name} ↗</button></div></header><div className="message-feed">{messages.map(m=><div className={`message ${m.sender_id===user.id?'outgoing':''}`} key={m.id}><small>{m.sender_name}</small><p>{m.body}</p><time>{new Date(m.created_at.replace(' ','T')+'Z').toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div>)}<div ref={end}/></div><form onSubmit={send} className="message-compose"><textarea aria-label="Your message" value={text} onChange={e=>setText(e.target.value)} maxLength={2000} placeholder="A little hello goes a long way…" rows={2} required/><Button loading={busy} disabled={!text.trim()} aria-label="Send message"><Send size={19}/></Button></form></>:<Empty title="Pick a conversation.">A new friendship could be a message away.</Empty>}</section></div>:<Empty title="Your first hello is waiting." action={<a className="button" href="#/">Find a dog to meet</a>}>Open a dog’s profile and choose “Ask a question” to start a conversation.</Empty>}
  </main>;
}
