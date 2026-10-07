import {useEffect,useState} from 'react';
import {onAuthStateChanged,signInWithPopup,signOut,User} from 'firebase/auth';
import {doc,getDoc,setDoc,serverTimestamp,collection,addDoc} from 'firebase/firestore';
import {auth,db,googleProvider} from './firebase';

type Snack={id:string;name:string;meta:string;tag:string;ingredients:string[];steps:string[]};
const snacks:Snack[]=[
{id:'veg-poha',name:'Vegetable Poha',meta:'15 min · Light & filling',tag:'Healthy',ingredients:['Poha','Onion','Peas','Peanuts','Lemon'],steps:['Rinse poha and drain.','Sauté onion, peas and peanuts.','Add poha, season and cook 3–4 minutes.','Finish with lemon.']},
{id:'paneer-toast',name:'Paneer Toast',meta:'12 min · Crispy & cheesy',tag:'Kids love it',ingredients:['Bread','Paneer','Onion','Capsicum'],steps:['Mix crumbled paneer with chopped vegetables.','Spread over bread.','Toast on a pan until crisp and warm.']},
{id:'masala-corn',name:'Masala Corn',meta:'10 min · Quick chai snack',tag:'Chai Time',ingredients:['Sweet corn','Butter','Chaat masala','Lemon'],steps:['Boil or steam corn.','Toss with butter and chaat masala.','Finish with lemon and serve warm.']}
];

export default function App(){
 const [user,setUser]=useState<User|null>(null); const [loading,setLoading]=useState(true);
 const [onboarded,setOnboarded]=useState(false); const [family,setFamily]=useState('2 adults, 1 child');
 const [selected,setSelected]=useState<Snack|null>(null); const [message,setMessage]=useState('');
 useEffect(()=>onAuthStateChanged(auth,async u=>{setUser(u);if(u){const s=await getDoc(doc(db,'users',u.uid));setOnboarded(Boolean(s.data()?.onboardingCompleted));}else setOnboarded(false);setLoading(false);}),[]);
 async function login(){await signInWithPopup(auth,googleProvider);}
 async function saveSetup(){if(!user)return;await setDoc(doc(db,'users',user.uid),{uid:user.uid,displayName:user.displayName,email:user.email,familySummary:family,onboardingCompleted:true,updatedAt:serverTimestamp()},{merge:true});setOnboarded(true);}
 async function made(snack:Snack){if(!user)return;await addDoc(collection(db,'users',user.uid,'history'),{recipeId:snack.id,dishName:snack.name,dishFamily:snack.id,madeAt:serverTimestamp(),source:'home'});setMessage(snack.name+' saved to today’s history ✓');}
 if(loading)return <main className="center"><p>Preparing your evening…</p></main>;
 if(!user)return <main className="welcome"><div><span className="eyebrow">SORTEVENING</span><h1>Evening sorted.</h1><p>Three useful snack ideas for your family. No endless scrolling. No “aaj kya banaye?” stress.</p><button className="primary" onClick={login}>Continue with Google</button></div></main>;
 if(!onboarded)return <main className="welcome"><div><span className="eyebrow">QUICK SETUP</span><h1>Tell us about home.</h1><p>We’ll use this to make your three daily picks more relevant.</p><label>Family</label><input value={family} onChange={e=>setFamily(e.target.value)} placeholder="2 adults, 1 child"/><button className="primary" onClick={saveSetup}>Start sorting my evenings</button></div></main>;
 if(selected)return <main className="shell"><button className="back" onClick={()=>setSelected(null)}>← Today’s picks</button><span className="tag">{selected.tag}</span><h1>{selected.name}</h1><p className="muted">{selected.meta}</p><h2>What you need</h2><ul>{selected.ingredients.map(x=><li key={x}>{x}</li>)}</ul><h2>Make it</h2><ol>{selected.steps.map(x=><li key={x}>{x}</li>)}</ol><button className="made" onClick={()=>made(selected)}>✓ Made Today</button>{message&&<p className="success">{message}</p>}</main>;
 return <main className="shell"><header><div><span className="eyebrow">SORT YOUR EVENING</span><h1>Aaj kya banaye?</h1><p>Three easy ideas for your family. No endless scrolling.</p></div><button className="avatar" onClick={()=>signOut(auth)} title="Sign out">{user.displayName?.[0]||'U'}</button></header><section className="chips"><button>10 min</button><button>Healthy</button><button>Kids</button><button>Chai Time</button></section><section className="title"><h2>Today’s 3 picks</h2><span>Made for your evening</span></section><section className="cards">{snacks.map((s,i)=><article className="card" key={s.id}><div className="number">0{i+1}</div><div className="food"><span className="tag">{s.tag}</span><h3>{s.name}</h3><p>{s.meta}</p><button className="recipe" onClick={()=>{setSelected(s);setMessage('')}}>See recipe →</button></div></article>)}</section><nav><b>Home</b><span>History</span><span>Favorites</span><span>Profile</span></nav></main>;
}