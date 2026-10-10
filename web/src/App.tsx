import {useEffect,useState} from 'react';
import {onAuthStateChanged,signInWithPopup,signOut,type User} from 'firebase/auth';
import {addDoc,collection,doc,getDoc,onSnapshot,serverTimestamp,setDoc} from 'firebase/firestore';
import {auth,db,googleProvider,functions,appCheckReady} from './firebase';
import {httpsCallable} from 'firebase/functions';

/** Licensed Commons photos: query matching filenames, retain attribution, fall back rather than show unrelated dishes. */
const photoCache=new Map<string,{url:string;credit:string}|null>();
function RecipePhoto({name,emoji}:{name:string;emoji:string}){
 const [photo,setPhoto]=useState<{url:string;credit:string}|null>(photoCache.get(name)??null);
 useEffect(()=>{
  let active=true;
  if(photoCache.has(name)){setPhoto(photoCache.get(name)??null);return;}
  const search=new URL('https://commons.wikimedia.org/w/api.php');
  search.searchParams.set('action','query');search.searchParams.set('generator','search');
  search.searchParams.set('gsrsearch',name+' food');search.searchParams.set('gsrnamespace','6');
  search.searchParams.set('gsrlimit','12');search.searchParams.set('prop','imageinfo');
  search.searchParams.set('iiprop','url|mime|extmetadata');search.searchParams.set('iiurlwidth','640');
  search.searchParams.set('format','json');search.searchParams.set('origin','*');
  fetch(search.toString()).then(r=>{if(!r.ok)throw Error('Photo provider unavailable');return r.json();}).then(data=>{
   const pages=Object.values(data?.query?.pages??{}) as {title?:string;imageinfo?:{mime?:string;thumburl?:string;descriptionurl?:string;extmetadata?:Record<string,{value?:string}>}[]}[];
   const words=name.toLowerCase().split(/\\s+/).filter(w=>w.length>3);
   const match=pages.find(p=>p.imageinfo?.[0]?.mime==='image/jpeg'&&p.imageinfo[0].thumburl&&words.some(w=>p.title?.toLowerCase().includes(w)));
   const info=match?.imageinfo?.[0];
   const result=info?.thumburl&&info.descriptionurl?{url:info.thumburl,credit:info.descriptionurl}:null;
   photoCache.set(name,result);if(active)setPhoto(result);
  }).catch(()=>{photoCache.set(name,null);if(active)setPhoto(null);});
  return()=>{active=false;};
 },[name]);
 return photo?<span className="recipe-photo-wrap"><img className="recipe-photo" src={photo.url} alt={name+' food photograph'} loading="lazy" referrerPolicy="no-referrer" onError={()=>{photoCache.set(name,null);setPhoto(null);}}/><a className="photo-credit" href={photo.credit} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>Photo &amp; license · Wikimedia Commons</a></span>:<span aria-label={name}>{emoji}</span>;
}
type Access={tier:'trial'|'paid'|'free';aiDailyLimit:number;historyDays:number;favoritesEnabled:boolean;rotatingDailyPicks:boolean;trialEndsAt:string|null};
const FREE_ACCESS:Access={tier:'free',aiDailyLimit:2,historyDays:1,favoritesEnabled:false,rotatingDailyPicks:false,trialEndsAt:null};
type AiRecipe={name:string;minutes:number;ingredients:string[];steps:string[];missingIngredients:string[]};
type Page='Home'|'Pantry'|'History'|'Favorites'|'Profile'|'Plans'|'Terms'|'Privacy'|'Contact';
type Recipe={id:string;name:string;minutes:number;tag:string;emoji:string;ingredients:string[];steps:string[];diet:'vegetarian'|'eggetarian';allergens:string[]};
type Profile={adults:number;children:number;diet:'vegetarian'|'eggetarian'|'nonvegetarian';allergies:string[];minutes:number};
type HistoryEntry={id:string;recipeId:string;dishName:string;date:string;dateKey?:string;aiRecipe?:AiRecipe};
const RECIPES:Recipe[]=[
{id:'poha',name:'Vegetable Poha',minutes:15,tag:'Light & comforting',emoji:'🥣',ingredients:['Poha','Onion','Peas','Peanuts','Lemon'],steps:['Rinse poha and drain.','Sauté onion, peas and peanuts.','Add poha, season and cook for 3–4 minutes.','Finish with lemon.'],diet:'vegetarian',allergens:['Peanuts']},
{id:'paneer-toast',name:'Paneer Toast',minutes:12,tag:'Family favourite',emoji:'🥪',ingredients:['Bread','Paneer','Onion','Capsicum'],steps:['Crumble paneer and chop vegetables.','Mix, season and spread on bread.','Toast until golden and warm.'],diet:'vegetarian',allergens:['Milk','Wheat']},
{id:'masala-corn',name:'Masala Corn',minutes:10,tag:'Perfect with chai',emoji:'🌽',ingredients:['Sweet corn','Butter','Chaat masala','Lemon'],steps:['Steam or boil the corn.','Toss with butter and chaat masala.','Add lemon and serve warm.'],diet:'vegetarian',allergens:['Milk']},
{id:'besan-chilla',name:'Besan Chilla',minutes:20,tag:'Protein-rich',emoji:'🫓',ingredients:['Besan','Onion','Tomato','Coriander'],steps:['Whisk besan with water and seasonings.','Add chopped vegetables.','Cook thin pancakes on both sides.'],diet:'vegetarian',allergens:[]},
{id:'fruit-chaat',name:'Fruit Chaat',minutes:10,tag:'Fresh & colourful',emoji:'🍎',ingredients:['Apple','Banana','Orange','Chaat masala'],steps:['Wash and chop fruit.','Sprinkle with chaat masala.','Toss and serve fresh.'],diet:'vegetarian',allergens:[]},
{id:'egg-toast',name:'Egg Toast',minutes:15,tag:'Quick & filling',emoji:'🍳',ingredients:['Egg','Bread','Onion','Pepper'],steps:['Beat eggs with onion and pepper.','Dip bread into the mixture.','Cook both sides on a lightly oiled pan.'],diet:'eggetarian',allergens:['Egg','Wheat']}
,
{id:"aloo-sandwich",name:"Aloo Sandwich",minutes:15,tag:"Tea-time favourite",emoji:"🥪",ingredients:["Bread","Potato","Onion","Coriander"],steps:["Mash boiled potato with chopped onion and coriander.","Spread between bread slices.","Toast until golden."],diet:"vegetarian",allergens:["Wheat"]},
{id:"sprouts-chaat",name:"Sprouts Chaat",minutes:10,tag:"Fresh and filling",emoji:"🥗",ingredients:["Cooked moong sprouts","Tomato","Onion","Lemon"],steps:["Use thoroughly cooked sprouts and let cool.","Mix with chopped vegetables.","Season and squeeze lemon."],diet:"vegetarian",allergens:[]},
{id:"suji-upma",name:"Vegetable Upma",minutes:20,tag:"Warm and hearty",emoji:"🥣",ingredients:["Suji","Onion","Carrot","Peas"],steps:["Dry roast suji.","Sauté vegetables with spices.","Add water, stir in suji and cook until fluffy."],diet:"vegetarian",allergens:["Wheat"]},
{id:"bread-pizza",name:"Tawa Bread Pizza",minutes:15,tag:"Kids love it",emoji:"🍕",ingredients:["Bread","Tomato","Capsicum","Cheese"],steps:["Spread tomato sauce on bread.","Top with vegetables and cheese.","Cover and toast on low heat."],diet:"vegetarian",allergens:["Wheat","Milk"]},
{id:"murmura-bhel",name:"Murmura Bhel",minutes:10,tag:"Crunchy snack",emoji:"🥣",ingredients:["Puffed rice","Onion","Tomato","Lemon"],steps:["Chop onion and tomato.","Toss with puffed rice and spices.","Add lemon just before serving."],diet:"vegetarian",allergens:[]},
{id:"sweet-potato-chaat",name:"Sweet Potato Chaat",minutes:15,tag:"Naturally sweet",emoji:"🍠",ingredients:["Sweet potato","Lemon","Chaat masala","Coriander"],steps:["Boil or steam sweet potato until tender.","Peel and cube.","Toss with lemon, spices and coriander."],diet:"vegetarian",allergens:[]},
{id:"rava-dosa",name:"Quick Rava Dosa",minutes:20,tag:"Crispy and light",emoji:"🫓",ingredients:["Suji","Rice flour","Curd","Cumin"],steps:["Mix ingredients with water into thin batter.","Rest briefly.","Pour on hot tawa and cook until crisp."],diet:"vegetarian",allergens:["Wheat","Milk"]},
{id:"cucumber-sandwich",name:"Cucumber Sandwich",minutes:10,tag:"No-cook option",emoji:"🥪",ingredients:["Bread","Cucumber","Butter","Pepper"],steps:["Slice cucumber thinly.","Spread butter on bread.","Layer cucumber, season and serve."],diet:"vegetarian",allergens:["Wheat","Milk"]},
{id:"egg-bhurji",name:"Egg Bhurji",minutes:12,tag:"Protein-rich",emoji:"🍳",ingredients:["Egg","Onion","Tomato","Coriander"],steps:["Sauté chopped onion and tomato.","Add beaten eggs.","Stir until fully cooked and garnish."],diet:"eggetarian",allergens:["Egg"]},
{id:"masala-makhana",name:"Roasted Makhana",minutes:10,tag:"Crunchy and quick",emoji:"🍿",ingredients:["Makhana","Ghee","Turmeric","Salt"],steps:["Warm ghee in a pan.","Roast makhana on low heat until crisp.","Toss with turmeric and salt."],diet:"vegetarian",allergens:["Milk"]},
{id:"tomato-sev-chaat",name:"Tomato Sev Chaat",minutes:10,tag:"Tangy and fun",emoji:"🥗",ingredients:["Tomato","Sev","Onion","Lemon"],steps:["Dice tomato and onion.","Season with lemon and spices.","Top with sev just before serving."],diet:"vegetarian",allergens:[]},
{id:"paneer-bhurji",name:"Paneer Bhurji",minutes:15,tag:"Protein-rich",emoji:"🧀",ingredients:["Paneer","Onion","Tomato","Capsicum"],steps:["Sauté onion, tomato and capsicum.","Add crumbled paneer and spices.","Cook briefly and serve."],diet:"vegetarian",allergens:["Milk"]},
{id:"banana-oats-pancake",name:"Banana Oats Pancake",minutes:15,tag:"Naturally sweet",emoji:"🥞",ingredients:["Banana","Oats","Milk","Cinnamon"],steps:["Mash banana and mix with oats and milk.","Pour small pancakes onto a lightly greased pan.","Cook both sides until set."],diet:"vegetarian",allergens:["Milk"]},
{id:"lemon-rice",name:"Lemon Rice",minutes:15,tag:"South Indian classic",emoji:"🍚",ingredients:["Cooked rice","Lemon","Mustard seeds","Curry leaves"],steps:["Temper mustard seeds and curry leaves.","Toss with cooked rice.","Finish with lemon juice."],diet:"vegetarian",allergens:[]},
{id:"corn-sandwich",name:"Corn Sandwich",minutes:15,tag:"Comforting bite",emoji:"🥪",ingredients:["Bread","Sweet corn","Cheese","Pepper"],steps:["Mix cooked corn with grated cheese and pepper.","Fill bread slices.","Toast until golden."],diet:"vegetarian",allergens:["Wheat","Milk"]}
];
const ALLERGENS=['Milk','Wheat','Peanuts','Egg','Soy','Tree nuts'];
type SavedResponse={favorites:string[];history:{id:string;recipeId:string;dishName:string;madeAt:number|null;aiRecipe?:AiRecipe|null}[]};
const savedItems=async(kind:'history'|'favorites',page:'recent'|'previous'='recent',count=5)=>{
 const call=httpsCallable<{kind:string;page:string;count:number},SavedResponse>(functions,'getSavedItems');
 return (await call({kind,page,count})).data;
};
const toHistoryEntry=(d:SavedResponse['history'][number]):HistoryEntry=>{
 const date=d.madeAt?new Date(d.madeAt):null;
 return {id:d.id,recipeId:d.recipeId,dishName:d.dishName,date:date?.toLocaleDateString()??'Recently',dateKey:date?dayKey(date):undefined,aiRecipe:d.aiRecipe??undefined};
};
const DEFAULT_PROFILE:Profile={adults:2,children:0,diet:'vegetarian',allergies:[],minutes:20};

/** Return a readable message while retaining the original error in the console. */
function errorText(error:unknown){const code=(error as {code?:string})?.code;if(code==='permission-denied')return 'Firestore access denied. Deploy the project Firestore rules and retry.';if(code==='auth/popup-closed-by-user')return 'Sign-in was cancelled.';return error instanceof Error?error.message:'Something went wrong. Please retry.';}

/** Rotate suggestions by local calendar day and avoid dishes already made today. */
function dayKey(value:Date){return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');}
function dailyPicks(profile:Profile,history:HistoryEntry[],rotating=true){
 const today=new Date();const todayKey=dayKey(today);
 const madeToday=new Set(rotating?history.filter(h=>h.dateKey===todayKey).map(h=>h.recipeId):[]);
 const recent=rotating?history.filter(h=>h.dateKey!==todayKey).slice(0,30):[];
 const counts=new Map<string,number>();recent.forEach(h=>counts.set(h.recipeId,(counts.get(h.recipeId)??0)+1));
 const eligible=RECIPES.filter(r=>(profile.diet!=='vegetarian'||r.diet==='vegetarian')&&r.minutes<=profile.minutes&&!r.allergens.some(a=>profile.allergies.includes(a))&&!madeToday.has(r.id));
 const seed=rotating?Math.floor(new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime()/86400000):12345;
 const score=(id:string)=>{let hash=seed+17;for(const c of id)hash=(Math.imul(hash,31)+c.charCodeAt(0))|0;return (hash>>>0)%1000;};
 return [...eligible].sort((a,b)=>(counts.get(a.id)??0)-(counts.get(b.id)??0)||score(a.id)-score(b.id)).slice(0,3);
}

/** Dish-aware illustration: use a neutral icon rather than an unrelated food photo. */
function dishIcon(name:string){const n=name.toLowerCase();if(/egg|omelette|anda/.test(n))return '🥚';if(/sandwich|toast|bread/.test(n))return '🥪';if(/corn|makai/.test(n))return '🌽';if(/poha|upma|khichdi/.test(n))return '🥣';if(/chilla|cheela|dosa|uttapam|pancake/.test(n))return '🫓';if(/samosa|pakora|pakoda|cutlet/.test(n))return '🥟';if(/paneer|cheese/.test(n))return '🧀';if(/noodle|maggi|pasta/.test(n))return '🍜';return '🍽️';}

/** Display a bounded number selector for household members. */
function Counter({label,value,min,max,onChange}:{label:string;value:number;min:number;max:number;onChange:(v:number)=>void}){return <div className="counter"><strong>{label}</strong><div><button disabled={value<=min} onClick={()=>onChange(value-1)} aria-label={'Remove '+label}>−</button><b>{value}</b><button disabled={value>=max} onClick={()=>onChange(value+1)} aria-label={'Add '+label}>+</button></div></div>;}

/** Root application: own authentication, navigation and persisted household state. */
export default function App(){
const [access,setAccess]=useState<Access>(FREE_ACCESS);
const [refreshingAccess,setRefreshingAccess]=useState(false);
const [checkoutBusy,setCheckoutBusy]=useState(false);
const [billingPlans,setBillingPlans]=useState<Record<string,{amountMinor:number;currency:string;durationDays:number}>>({});
const [billingMessage,setBillingMessage]=useState('');
const [user,setUser]=useState<User|null>(null),[busy,setBusy]=useState(true),[saving,setSaving]=useState(false);
const [profile,setProfile]=useState<Profile>(DEFAULT_PROFILE),[onboarded,setOnboarded]=useState(false);
const [page,setPage]=useState<Page>('Home'),[recipe,setRecipe]=useState<Recipe|null>(null);
const [history,setHistory]=useState<HistoryEntry[]>([]),[favorites,setFavorites]=useState<string[]>([]);
const [showOlderHistory,setShowOlderHistory]=useState(false),[loadingOlderHistory,setLoadingOlderHistory]=useState(false),[showMoreFavorites,setShowMoreFavorites]=useState(false);
const [message,setMessage]=useState(''),[failure,setFailure]=useState(''),[step,setStep]=useState(0);
const [menuOpen,setMenuOpen]=useState(false),[pantry,setPantry]=useState<string[]>([]),[pantryInput,setPantryInput]=useState('');
const [aiCache,setAiCache]=useState<Record<string,AiRecipe[]>>({});
const [aiLimitReached,setAiLimitReached]=useState(false);
const [aiBusy,setAiBusy]=useState(false),[aiRecipes,setAiRecipes]=useState<AiRecipe[]>([]),[selectedAiRecipe,setSelectedAiRecipe]=useState<AiRecipe|null>(null),[aiError,setAiError]=useState(''),[showCatalog,setShowCatalog]=useState(false);

/** Restore Google session and fetch the user's profile without trapping the loading screen. */
useEffect(()=>{const unsubscribe=onAuthStateChanged(auth,async next=>{setBusy(true);setFailure('');setUser(next);try{if(next){setHistory([]);setFavorites([]);const accessCall=httpsCallable<undefined,Access>(functions,'getAccessStatus');
const status=(await accessCall()).data;setAccess(status);
const snapshot=await getDoc(doc(db,'users',next.uid));if(snapshot.exists()){const d=snapshot.data();setProfile({adults:d.household?.adults??2,children:d.household?.children??0,diet:d.diet??'vegetarian',allergies:d.allergies??[],minutes:d.preferredMinutes??20});setOnboarded(Boolean(d.onboardingCompleted));const [historyDocs,favoriteDocs]=await Promise.all([savedItems('history'),status.favoritesEnabled?savedItems('favorites'):Promise.resolve(null)]);setHistory(historyDocs.history.map(toHistoryEntry));setFavorites(favoriteDocs?.favorites??[]);}else setOnboarded(false);}else{setAccess(FREE_ACCESS);setOnboarded(false);setHistory([]);setFavorites([]);}}catch(error){console.error('Profile loading',error);setFailure(errorText(error));setOnboarded(false);}finally{setBusy(false);}});return unsubscribe;},[]);

/** Subscription status is always verified by the shared backend, never by local payment state. */
async function refreshSubscription(){
 if(!user||refreshingAccess)return;
 setRefreshingAccess(true);setFailure('');
 try{
  const status=(await httpsCallable<undefined,Access>(functions,'getAccessStatus')()).data;
  setAccess(status);setMessage(status.tier==='paid'?'Premium is active on your account.':'Subscription status refreshed.');
 }catch(error){setFailure(errorText(error));}
 finally{setRefreshingAccess(false);}
}

/** Web checkout only. Backend is intentionally disabled until merchant setup is complete. */
async function startPremiumCheckout(plan:'monthly'|'yearly'){
 if(!user||checkoutBusy)return;
 setCheckoutBusy(true);setFailure('');
 try{
  const create=httpsCallable<{plan:'monthly'|'yearly'},{orderId:string;keyId:string;amount:number;currency:string}>(functions,'createRazorpayOrder');
  const {data}=await create({plan});
  const Razorpay=(window as Window & {Razorpay?:new (options:Record<string,unknown>)=>{open:()=>void}}).Razorpay;
  if(!Razorpay)throw Error('Payment checkout is unavailable. Please try again later.');
  setBillingMessage('Payment checkout opened. Complete or cancel the payment to continue.');
  const checkout=new Razorpay({key:data.keyId,order_id:data.orderId,amount:data.amount,currency:data.currency,name:'NashtaBuddy',description:plan==='monthly'?'Monthly Premium':'Yearly Premium',
   handler:async(payment:{razorpay_payment_id:string;razorpay_order_id:string;razorpay_signature:string})=>{
    try{
     await httpsCallable(functions,'verifyRazorpayPayment')(payment);
     await refreshSubscription();setBillingMessage('Payment verified. Your account is updating.');
    }catch(error){setFailure(errorText(error));setBillingMessage('Payment verification pending. Please refresh your subscription shortly.');}
   },modal:{ondismiss:()=>{setCheckoutBusy(false);setBillingMessage('Checkout closed. No payment was confirmed.');}},payment:{failed:()=>setBillingMessage('Payment failed. No Premium access was activated.')}});
  checkout.open();
 }catch(error){setFailure(errorText(error));}
 finally{setCheckoutBusy(false);}
}

/** Keep web entitlements live across tabs, devices and webhook updates. */
useEffect(()=>{
 if(!user)return;
 const stop=onSnapshot(doc(db,'users',user.uid,'entitlements','ai'),()=>{
  void httpsCallable<undefined,Access>(functions,'getAccessStatus')().then(result=>setAccess(result.data)).catch(error=>console.error('Entitlement refresh',error));
 },error=>console.error('Entitlement listener',error));
 return stop;
},[user?.uid]);

useEffect(()=>{
 if(!user)return;
 let active=true;
 httpsCallable<undefined,{plans:Record<string,{amountMinor:number;currency:string;durationDays:number}>}>(functions,'getBillingPlans')().then(result=>{if(active)setBillingPlans(result.data.plans);}).catch(error=>console.error('Billing configuration',error));
 return()=>{active=false;};
},[user?.uid]);
function priceLabel(id:string){
 const plan=billingPlans[id];
 return plan?new Intl.NumberFormat('en-IN',{style:'currency',currency:plan.currency,maximumFractionDigits:2}).format(plan.amountMinor/100):'Unavailable';
}

/** Sign in with Google and expose popup failures to the user. */
async function login(){setFailure('');setBusy(true);try{await signInWithPopup(auth,googleProvider);}catch(error){console.error('Sign-in',error);setFailure(errorText(error));setBusy(false);}}

/** Save structured onboarding data or profile edits to the signed-in account. */
async function saveProfile(){if(!user)return;setSaving(true);setFailure('');try{await setDoc(doc(db,'users',user.uid),{uid:user.uid,displayName:user.displayName,email:user.email,photoURL:user.photoURL,household:{adults:profile.adults,children:profile.children},diet:profile.diet,allergies:profile.allergies,preferredMinutes:profile.minutes,onboardingCompleted:true,updatedAt:serverTimestamp()},{merge:true});setOnboarded(true);setStep(0);setMessage('Your preferences are saved.');}catch(error){console.error('Save profile',error);setFailure(errorText(error));}finally{setSaving(false);}}

/** Load real history and favorites for the current signed-in user. */
async function loadLists(){if(!user)return;setFailure('');try{
 const [h,f]=await Promise.all([savedItems('history'),access.favoritesEnabled?savedItems('favorites'):Promise.resolve(null)]);
 setHistory(h.history.map(toHistoryEntry));setFavorites(f?.favorites??[]);
 }catch(error){console.error('Load saved items',error);setFailure(errorText(error));}}

/** Fetch only days 8–14 when the user explicitly asks; keep older data in Firestore. */
async function loadPreviousHistory(){
 if(!user||access.historyDays<=7||loadingOlderHistory||showOlderHistory)return;
 setLoadingOlderHistory(true);setFailure('');
 try{
  const previous=await savedItems('history','previous');
  setHistory(current=>[...new Map([...current,...previous.history.map(toHistoryEntry)].map(entry=>[entry.id,entry])).values()].sort((a,b)=>(b.dateKey??'').localeCompare(a.dateKey??'')));
  setShowOlderHistory(true);
 }catch(error){console.error('Previous history',error);setFailure(errorText(error));}
 finally{setLoadingOlderHistory(false);}
}

/** Navigate to a real screen and load its server-backed data. */
function navigate(next:Page){if(next==='History')setShowOlderHistory(false);if(next==='Favorites')setShowMoreFavorites(false);setMenuOpen(false);setPage(next);setRecipe(null);setSelectedAiRecipe(null);setMessage('');setFailure('');if(next==='History'||(next==='Favorites'&&access.favoritesEnabled))void loadLists();}

/** Save or remove a recipe from the user's favorites collection. */
async function toggleFavorite(item:Recipe){
 if(!user||saving)return;
 if(!access.favoritesEnabled){setFailure('Favorites are available during your trial and with Premium. Your saved recipes are safe.');return;}
 setSaving(true);setFailure('');
 try{
  const operation=favorites.includes(item.id)?'remove':'add';
  const call=httpsCallable<{recipeId:string;operation:'add'|'remove'},{ok:boolean}>(functions,'updateFavorite');
  await call({recipeId:item.id,operation});
  if(operation==='remove')setFavorites(old=>old.filter(x=>x!==item.id));
  else setFavorites(old=>[item.id,...old].slice(0,10));
  await loadLists();
 }catch(error){console.error('Favorite',error);setFailure(errorText(error));}
 finally{setSaving(false);}
}

/** Record one completed dish, with an explicit confirmation and disabled submit state. */
async function madeToday(item:Recipe){if(!user||saving)return;if(history.some(h=>h.recipeId===item.id&&h.dateKey===dayKey(new Date()))){setMessage(item.name+' was already marked Made Today.');return;}setSaving(true);setFailure('');try{await addDoc(collection(db,'users',user.uid,'history'),{recipeId:item.id,dishFamily:item.id,dishName:item.name,madeAt:serverTimestamp()});setMessage(item.name+' added to your history.');setHistory(old=>[{id:'pending-'+Date.now(),recipeId:item.id,dishName:item.name,date:new Date().toLocaleDateString(),dateKey:dayKey(new Date())},...old]);await loadLists();}catch(error){console.error('Made Today',error);setFailure(errorText(error));}finally{setSaving(false);}}

/** Add an ingredient from the user's pantry without duplicates. */
function addIngredient(){const values=pantryInput.split(/[,;\n]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);if(!values.length)return;setPantry(old=>[...new Set([...old,...values])].slice(0,20));setPantryInput('');}

/** Rank safe recipes by how many listed ingredients are already available. */
function pantryMatches(){return RECIPES.filter(r=>(profile.diet!=='vegetarian'||r.diet==='vegetarian')&&!r.allergens.some(a=>profile.allergies.includes(a))&&r.minutes<=profile.minutes).map(r=>({...r,available:r.ingredients.filter(i=>pantry.includes(i.toLowerCase())),missing:r.ingredients.filter(i=>!pantry.includes(i.toLowerCase()))})).sort((a,b)=>b.available.length-a.available.length||a.missing.length-b.missing.length).slice(0,3);}

/** Request optional AI ideas from the authenticated Firebase callable backend. */
async function suggestWithAI(){
 if(!appCheckReady||pantry.length===0||aiBusy)return;
 const cacheKey=JSON.stringify([user?.uid,dayKey(new Date()),access.tier,[...pantry].sort(),profile.diet,[...profile.allergies].sort(),profile.minutes]);
 if(aiCache[cacheKey]){setAiRecipes(aiCache[cacheKey]);setSelectedAiRecipe(null);setAiError('');setAiLimitReached(false);return;}
 setAiBusy(true);setAiError('');setAiLimitReached(false);setSelectedAiRecipe(null);
 try{
  const call=httpsCallable<{ingredients:string[]},{recipes:AiRecipe[];disclaimer:string}>(functions,'suggestPantrySnacks');
  const response=await call({ingredients:pantry.slice(0,20)});
  if(!Array.isArray(response.data.recipes))throw new Error('Unexpected AI response. Please redeploy the updated function.');
  setAiRecipes(response.data.recipes);setAiCache(old=>({...old,[cacheKey]:response.data.recipes}));
 }catch(error){
  console.error('AI pantry ideas',error);
  const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'unknown';
  const details=error instanceof Error?error.message:'Request failed';
  if(code.includes('resource-exhausted')||/daily (AI )?limit reached/i.test(details)){setAiLimitReached(true);setAiError('');}
  else setAiError('Could not fetch snack ideas right now. Please try again later.');
 }finally{setAiBusy(false);}
}

/** Save AI-generated dish to cooking history without treating it as a catalog recipe. */
async function madeAiToday(item:AiRecipe){
 if(!user||saving)return;setSaving(true);setFailure('');
 try{
  await addDoc(collection(db,'users',user.uid,'history'),{recipeId:'ai-'+Date.now(),dishFamily:'ai-snack',dishName:item.name,source:'ai',aiRecipe:{name:item.name,minutes:item.minutes,ingredients:item.ingredients,steps:item.steps,missingIngredients:item.missingIngredients},madeAt:serverTimestamp()});
  setMessage(item.name+' added to your history.');await loadLists();
 }catch(error){console.error('Save AI snack',error);setFailure(errorText(error));}
 finally{setSaving(false);}
}

const picks=dailyPicks(profile,history,access.rotatingDailyPicks);const madeTodayIds=new Set(history.filter(h=>h.dateKey===dayKey(new Date())).map(h=>h.recipeId));
const controls=<>{failure&&<div role="alert" className="alert">{failure}</div>}{message&&<div role="status" className="notice">{message}</div>}</>;
const preferences=<><div className="countergroup"><Counter label="Adults" value={profile.adults} min={1} max={12} onChange={adults=>setProfile(p=>({...p,adults}))}/><Counter label="Children" value={profile.children} min={0} max={12} onChange={children=>setProfile(p=>({...p,children}))}/></div><h3>Food preference</h3><div className="options">{(['vegetarian','eggetarian','nonvegetarian'] as const).map(d=><button className={profile.diet===d?'chosen':''} key={d} onClick={()=>setProfile(p=>({...p,diet:d}))}>{d==='nonvegetarian'?'Non-vegetarian':d==='eggetarian'?'Eggetarian':'Vegetarian'}</button>)}</div><h3>Allergies to avoid</h3><div className="options">{ALLERGENS.map(a=><button key={a} className={profile.allergies.includes(a)?'chosen':''} onClick={()=>setProfile(p=>({...p,allergies:p.allergies.includes(a)?p.allergies.filter(x=>x!==a):[...p.allergies,a]}))}>{a}</button>)}</div><p className="hint">Always check ingredients and packaging for allergens.</p><h3>Time available</h3><div className="options">{[10,15,20,30].map(n=><button key={n} className={profile.minutes===n?'chosen':''} onClick={()=>setProfile(p=>({...p,minutes:n}))}>{n} min</button>)}</div></>;
const legalContent=(kind:'Terms'|'Privacy'|'Contact')=><article className="legal-copy"><h1>{kind==='Terms'?'Terms & Conditions':kind==='Privacy'?'Privacy':'Contact'}</h1>{kind==='Terms'?<><p>SortEvening provides recipe suggestions for personal household use. AI-generated recipes may be inaccurate or incomplete. Always check ingredients, allergies, food safety, and cooking instructions before preparing a dish.</p><p>Suggestions are informational, not medical or nutritional advice. Service availability and usage limits may change. Do not misuse the service or attempt unauthorized access.</p></>:kind==='Privacy'?<><p>Google sign-in is provided through Firebase Authentication. Household preferences, favorites, and cooking history are stored in Firebase Firestore with your account.</p><p>When you request AI pantry suggestions, your ingredients and relevant food preferences are processed through our cloud function and an AI service. Firebase App Check helps protect the service. Avoid entering sensitive information in pantry fields.</p><p>For questions or data requests, contact <a href="mailto:rohitmallick85@gmail.com">rohitmallick85@gmail.com</a>.</p></>:<><p>Questions, suggestions, or account data requests?</p><p>Email: <a href="mailto:rohitmallick85@gmail.com">rohitmallick85@gmail.com</a></p></>}</article>;
const sharedFooter=<footer className="site-footer"><div className="footer-love">Made With Love for My Wife Darshana <span aria-hidden="true">♥</span></div><div className="footer-links"><a href="https://luckydangle-app.web.app/" target="_blank" rel="noopener noreferrer">Lucky Dangle</a><a href="https://quickstories.in/" target="_blank" rel="noopener noreferrer">QuickStories</a><a href="https://parentsboard.in/" target="_blank" rel="noopener noreferrer">ParentsBoard</a></div><div className="footer-links footer-legal"><button onClick={()=>navigate('Terms')}>T&amp;C</button><button onClick={()=>navigate('Privacy')}>Privacy</button><button onClick={()=>navigate('Contact')}>Contact</button></div><div className="footer-credit">© {new Date().getFullYear()} SortEvening · Designed &amp; Developed by Rohit Kumar Mallick</div></footer>;
if(busy)return <main className="center">Preparing your evening…</main>;
if(!user&&(page==='Terms'||page==='Privacy'||page==='Contact'))return <div className="public-shell"><main className="public-legal"><button className="back" onClick={()=>setPage('Home')}>← Back to SortEvening</button><div className="surface legal-page">{legalContent(page)}</div></main>{sharedFooter}</div>;
if(!user)return <main className="authscreen landing-v2">
 <header className="landing-nav"><div className="brand">Sort<span>Evening</span><small>Every evening, sorted.</small></div><button className="landing-nav-cta" onClick={()=>void login()}>Continue with Google →</button></header>
 <section className="landing-hero">
 <div className="landing-story"><span className="eyebrow">THE 6 PM QUESTION, SOLVED.</span><h1>“Aaj kya<br/><span className="landing-accent">banaye?”</span></h1><p className="landing-lead">The whole family is hungry. Everyone has an opinion. Nobody has an idea. 😅</p><p>Meet your everyday snack companion. Three fresh ideas, pantry-friendly recipes, and one less decision to make.</p><div className="landing-actions"><button className="primary landing-cta" onClick={()=>void login()}>Find tonight's snack →</button><span>Google sign-in · Free to explore</span></div>{controls}</div>
 <div className="landing-scene" aria-label="A playful kitchen scene"><div className="scene-question">“Kuch tasty bana do!” 💬</div><div className="scene-character">👩‍🍳</div><div className="scene-counter"><span>🥪</span><span>🥣</span><span>🌽</span></div><div className="scene-answer">“Bas 15 minute!” ✨</div></div>
 </section>
 <section className="landing-how"><div className="landing-how-heading"><span className="eyebrow">LESS THINKING. MORE SNACKING.</span><h2>From “what now?” to “wow!”</h2><p>Simple, useful, and made for everyday family evenings.</p></div><div className="landing-steps"><article><span className="step-icon">✨</span><h3>Three ideas, every day</h3><p>Discover quick picks that consider your family's preferences.</p></article><article><span className="step-icon">🧺</span><h3>Use what's in your kitchen</h3><p>Enter pantry ingredients and find recipes that make sense.</p></article><article><span className="step-icon">💚</span><h3>Remember the favourites</h3><p>Save what worked, track what you made, and keep evenings fresh.</p></article></div></section>
 <section className="landing-last"><div><span className="eyebrow">YOUR NEXT EVENING, SORTED.</span><h2>Good food. Less confusion. More family time.</h2></div><button className="primary" onClick={()=>void login()}>Get started →</button></section>
 {sharedFooter}
 </main>;
if(!onboarded)return <main className="authscreen"><div className="authpanel"><span className="eyebrow">YOUR HOME · STEP {step+1} OF 2</span><h1>{step===0?'Who are we cooking for?':'Make it yours.'}</h1><p>Just a few quick choices. You can change these anytime.</p>{step===0?<div className="countergroup"><Counter label="Adults" value={profile.adults} min={1} max={12} onChange={adults=>setProfile(p=>({...p,adults}))}/><Counter label="Children" value={profile.children} min={0} max={12} onChange={children=>setProfile(p=>({...p,children}))}/></div>:<><h3>Food preference</h3><div className="options">{(['vegetarian','eggetarian','nonvegetarian'] as const).map(d=><button key={d} className={profile.diet===d?'chosen':''} onClick={()=>setProfile(p=>({...p,diet:d}))}>{d}</button>)}</div><h3>Allergies</h3><div className="options">{ALLERGENS.map(a=><button key={a} className={profile.allergies.includes(a)?'chosen':''} onClick={()=>setProfile(p=>({...p,allergies:p.allergies.includes(a)?p.allergies.filter(x=>x!==a):[...p.allergies,a]}))}>{a}</button>)}</div><p className="hint">Always verify allergens in ingredients.</p><h3>Cooking time</h3><div className="options">{[10,15,20,30].map(n=><button key={n} className={profile.minutes===n?'chosen':''} onClick={()=>setProfile(p=>({...p,minutes:n}))}>{n} min</button>)}</div></>}<div className="actions">{step===1&&<button className="secondary" onClick={()=>setStep(0)}>Back</button>}<button className="primary" disabled={saving} onClick={()=>step===0?setStep(1):void saveProfile()}>{saving?'Saving…':step===0?'Continue →':'Finish setup →'}</button></div>{controls}</div></main>;
return <div className="layout"><aside className="sidebar"><div className="brand">Sort<span>Evening</span><small>Every evening, sorted.</small></div><div className="navlinks">{(['Home','Pantry','History','Favorites','Plans','Profile'] as Page[]).map(p=><button key={p} className={page===p?'active':''} onClick={()=>navigate(p)}><span className="nav-icon" aria-hidden="true">{p==='Home'?'🏠':p==='Pantry'?'🧺':p==='History'?'🕘':p==='Favorites'?'💚':p==='Plans'?'✨':'⚙️'}</span>{p}</button>)}</div><div className="sidefoot">Made with love, every evening.</div></aside><main className="workspace"><header className="topbar"><div className="brand mobilebrand">Sort<span>Evening</span></div><div className="topbar-actions"><button className="mobile-menu-button" aria-label="Open features menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(open=>!open)}>☰ Menu</button><div className="accountwrap"><button className="account" aria-expanded={menuOpen} aria-label="Account menu" onClick={()=>setMenuOpen(open=>!open)}>{user.photoURL?<img src={user.photoURL} alt=""/>:<span>{user.displayName?.[0]??'U'}</span>}<span>{user.displayName?.split(' ')[0]??'Profile'} ▾</span></button>{menuOpen&&<div className="accountmenu"><button onClick={()=>navigate('Profile')}>My profile & settings</button><button onClick={()=>navigate('Plans')}>Upgrade to Premium / Plans</button><button disabled={refreshingAccess} onClick={()=>{setMenuOpen(false);void refreshSubscription();}}>{refreshingAccess?'Refreshing…':'↻ Refresh subscription'}</button><button onClick={async()=>{setMenuOpen(false);try{await signOut(auth);}catch(error){console.error('Sign out',error);setFailure(errorText(error));}}}>Sign out</button></div>}</div>{menuOpen&&<div className="mobile-feature-menu">{(['Home','Pantry','History','Favorites','Profile'] as Page[]).map(p=><button key={p} onClick={()=>navigate(p)}>{p}</button>)}<button onClick={()=>navigate('Plans')}>Upgrade / Plans</button><button disabled={refreshingAccess} onClick={()=>{setMenuOpen(false);void refreshSubscription();}}>↻ Refresh subscription</button><button onClick={async()=>{setMenuOpen(false);await signOut(auth);}}>Sign out</button></div>}</div></header>{controls}
{recipe?<section className="content"><button className="back" onClick={()=>setRecipe(null)}>← Back to {page}</button><div className="recipehero"><RecipePhoto name={recipe.name} emoji={recipe.emoji}/><div><div className="eyebrow">{recipe.tag}</div><h1>{recipe.name}</h1><p>{recipe.minutes} minutes · Easy · {profile.adults+profile.children} at home</p></div></div><div className="twocol"><section className="surface"><h2>Ingredients</h2><ul>{recipe.ingredients.map(x=><li key={x}>{x}</li>)}</ul></section><section className="surface"><h2>Let's make it</h2><ol>{recipe.steps.map(x=><li key={x}>{x}</li>)}</ol></section></div><div className="actions"><button className="secondary" disabled={saving} onClick={()=>void toggleFavorite(recipe)}>{favorites.includes(recipe.id)?'♥ Saved':'♡ Save favorite'}</button><button className="primary" disabled={saving||madeTodayIds.has(recipe.id)} onClick={()=>void madeToday(recipe)}>{madeTodayIds.has(recipe.id)?'✓ Already made today':saving?'Saving…':'✓ Made Today'}</button></div></section>:
page==='Home'?<section className="content"><div className="intro"><span className="eyebrow">YOUR DAILY INSPIRATION</span><h1>Aaj kya banaye? <span>✨</span></h1><p>Three simple ideas for a happier evening, tailored to your food preferences.</p></div><div className="highlight"><div><span>☀️ TODAY'S PICKS</span><h2>Less thinking. More snacking.</h2><p>{profile.adults} adult{profile.adults===1?'':'s'} · {profile.children} children · {profile.minutes} min or less</p></div><span className="highlightemoji">🍵</span></div><div className="sectionheading"><h2>Your 3 picks</h2><span>Simple ideas for today</span></div>{picks.length===0?<div className="surface">No new suggestions left today with these preferences. Explore your pantry for more ideas, or update your Profile.</div>:<div className="recipecards">{picks.map((r,i)=><article className="recipecard" key={r.id}><div className="foodart"><RecipePhoto name={r.name} emoji={r.emoji}/><em>0{i+1}</em></div><div className="cardbody"><span className="eyebrow">{r.tag}</span><h3>{r.name}</h3><p>⏱ {r.minutes} min &nbsp; · &nbsp; Easy</p><div className="cardactions"><button className="view" onClick={()=>setRecipe(r)}>View recipe →</button><button className="heart" disabled={saving} onClick={()=>void toggleFavorite(r)} aria-label="Toggle favorite">{favorites.includes(r.id)?'♥':'♡'}</button></div></div></article>)}</div>}<div className="home-pantry-cta"><div><span className="eyebrow">NOT IN THE MOOD FOR THESE?</span><h2>What’s in your kitchen?</h2><p>Tell us what ingredients you have. We’ll suggest snacks you can actually make.</p></div><button className="primary" onClick={()=>navigate('Pantry')}>Explore my pantry →</button></div></section>:
page==='Pantry'?<section className="content pantry-page"><span className="eyebrow">YOUR KITCHEN · YOUR SNACKS</span><h1>What can I make today?</h1><p className="muted">1. Add what you have at home. 2. Tap the green button. 3. Pick a snack to see how to make it.</p><form className="pantryform" onSubmit={e=>{e.preventDefault();addIngredient();}}><input aria-label="Ingredients" placeholder="e.g. eggs, maida, onion" value={pantryInput} onChange={e=>setPantryInput(e.target.value)}/><button className="secondary" type="submit">+ Add</button></form><p className="hint">Separate multiple ingredients with commas. Tap a chip to remove it.</p><div className="options">{pantry.map(i=><button className="chosen" key={i} onClick={()=>{setPantry(old=>old.filter(x=>x!==i));setAiRecipes([]);setSelectedAiRecipe(null);}}>{i} ×</button>)}</div><button className="primary ai-main-cta" disabled={!appCheckReady||aiBusy||pantry.length===0} onClick={()=>void suggestWithAI()}>{aiBusy?'Finding delicious snacks…':'✨ Suggest Snacks with AI →'}</button>{!appCheckReady&&<p className="hint">AI needs secure App Check configuration.</p>}{aiLimitReached&&<div className="ai-limit-card" role="status"><span className="ai-limit-emoji" aria-hidden="true">🍽️</span><div><h3>You’ve explored all your AI snack ideas for today!</h3><p>Fresh ideas will be ready tomorrow. Want more inspiration? Premium includes 5 AI requests per day. Free includes 2.</p><div className="ai-limit-actions"><button className="primary" onClick={()=>navigate('Plans')}>Explore Premium →</button><button className="secondary" onClick={()=>setShowCatalog(true)}>Browse classic recipes</button></div><small>Premium subscriptions are managed through your web account.</small></div></div>}{aiError&&<p className="alert" role="alert">{aiError}</p>}{aiRecipes.length>0&&<div className="ai-results"><div className="sectionheading"><h2>Choose your evening snack</h2><span>{aiRecipes.length} ideas for your ingredients</span></div><div className="ai-snack-grid">{aiRecipes.map((r,i)=><button className={'ai-snack-option '+(selectedAiRecipe===r?'selected':'')} key={i} onClick={()=>setSelectedAiRecipe(r)}><span className="ai-snack-icon" aria-hidden="true">🍽️</span><span><strong>{r.name}</strong><small>⏱ {r.minutes} min · {r.missingIngredients.length===0?'All ingredients ready':r.missingIngredients.length+' additional ingredients'}</small></span><span aria-hidden="true">→</span></button>)}</div></div>}{selectedAiRecipe&&<section className="surface ai-recipe-detail"><button className="back" onClick={()=>setSelectedAiRecipe(null)}>← All snack ideas</button><div className="ai-recipe-heading"><span aria-hidden="true">{dishIcon(selectedAiRecipe.name)}</span><div><h2>{selectedAiRecipe.name}</h2><p>Approx. {selectedAiRecipe.minutes} minutes · For your household</p></div></div><div className="twocol"><div><h3>Ingredients</h3><ul>{selectedAiRecipe.ingredients.map((x,i)=><li key={i}>{x}</li>)}</ul>{selectedAiRecipe.missingIngredients.length>0&&<p><strong>You'll also need:</strong> {selectedAiRecipe.missingIngredients.join(', ')}</p>}</div><div><h3>How to make it</h3><ol>{selectedAiRecipe.steps.map((x,i)=><li key={i}>{x}</li>)}</ol></div></div><p className="hint">AI-generated recipe. Check allergens and cook eggs or meat thoroughly.</p><button className="primary" disabled={saving} onClick={()=>void madeAiToday(selectedAiRecipe)}>{saving?'Saving…':'✓ Made This Snack'}</button></section>}<div className="catalog-toggle"><button className="secondary" onClick={()=>setShowCatalog(x=>!x)}>{showCatalog?'Hide classic recipes':'Browse classic recipes ↓'}</button></div>{showCatalog&&<div className="recipecards">{pantryMatches().map(r=><article className="recipecard" key={r.id}><div className="foodart"><RecipePhoto name={r.name} emoji={r.emoji}/></div><div className="cardbody"><h3>{r.name}</h3><p>{r.available.length} of {r.ingredients.length} ingredients ready</p><button className="view" onClick={()=>setRecipe(r)}>View recipe →</button></div></article>)}</div>}</section>:
(page==='Terms'||page==='Privacy'||page==='Contact')?<section className="content legal-page">{legalContent(page)}</section>:
page==='History'?<section className="content"><span className="eyebrow">YOUR COOKING JOURNEY</span><h1>Made with love.</h1><p className="muted">Your recent cooking history. Older entries stay safely stored.</p>{history.filter(h=>h.dateKey&&h.dateKey>=dayKey(new Date(Date.now()-(access.historyDays===1?1:showOlderHistory?14:7)*86400000))).length?<div className="surface">{history.filter(h=>h.dateKey&&h.dateKey>=dayKey(new Date(Date.now()-(showOlderHistory?14:7)*86400000))).filter((h,i,all)=>all.findIndex(other=>other.recipeId===h.recipeId&&(other.dateKey??other.date)===(h.dateKey??h.date))===i).map(h=><div className="historyrow" key={h.id}><div><strong>{h.dishName}</strong><small>{h.date}</small></div><button onClick={()=>{const r=RECIPES.find(x=>x.id===h.recipeId);if(r)setRecipe(r);else if(h.aiRecipe){setSelectedAiRecipe(h.aiRecipe);setPage('Pantry');}}}>View recipe →</button></div>)}</div>:<div className="surface empty">🍽️<h2>Your story starts with a snack.</h2><p>Mark a recipe Made Today and it'll appear here.</p><button className="secondary" onClick={()=>navigate('Home')}>Explore today's picks</button></div>}{access.historyDays>1&&!showOlderHistory&&<button className="secondary" disabled={loadingOlderHistory} onClick={()=>void loadPreviousHistory()}>{loadingOlderHistory?'Loading…':'Show previous 7 days' }</button>}</section>:
page==='Plans'?<section className="content plans-page"><span className="eyebrow">SORTEVENING MEMBERSHIP</span><h1>Choose how you snack.</h1><p className="muted">Enjoy all the essentials for your first 30 days. Continue with Premium to keep the full experience.</p><div className="surface"><p>Your current access: {access.tier==='trial'?'30-day free trial':access.tier==='paid'?'Premium':'Free after expiry'}{access.tier==='trial'&&access.trialEndsAt?' · Ends '+new Date(access.trialEndsAt).toLocaleDateString():''}</p><div className="plans-table-scroll"><table className="plans-table"><thead><tr><th scope="col">Feature</th><th scope="col">30-day trial</th><th scope="col">Premium</th><th scope="col">Free after expiry</th></tr></thead><tbody>{[
['Daily AI snack requests','5','5','2'],
['Cooking history','Last 14 days (7 + 7)','Last 14 days (7 + 7)','Last 1 day'],
['Favorites','Up to 10','Up to 10','Hidden, saved safely'],
['Daily default recipes','New picks daily','New picks daily','Same picks each day'],
['Stored history & favorites','Preserved','Preserved','Preserved'],
['Diet & household preferences','Included','Included','Included']
].map(([feature,trial,paid,free])=><tr key={feature}><th scope="row">{feature}</th><td>{trial}</td><td>{paid}</td><td>{free}</td></tr>)}</tbody></table></div></div><div className="surface"><h2>Upgrade to Premium</h2><p>Current prices are loaded securely from Firebase. Payment availability depends on merchant activation.</p><div className="actions"><button className="primary" disabled={checkoutBusy||!billingPlans.monthly} onClick={()=>void startPremiumCheckout('monthly')}>Monthly · {priceLabel('monthly')}</button><button className="primary" disabled={checkoutBusy||!billingPlans.yearly} onClick={()=>void startPremiumCheckout('yearly')}>Yearly · {priceLabel('yearly')}</button><button className="secondary" disabled={refreshingAccess} onClick={()=>void refreshSubscription()}>{refreshingAccess?'Refreshing…':'↻ Refresh subscription'}</button></div><p className="muted">{billingMessage} Your saved history and favorites will remain in your account even if your plan expires.</p></div></section>:
page==='Favorites'?<section className="content"><span className="eyebrow">SAVED FOR LATER</span><h1>Your favorites.</h1>{!access.favoritesEnabled?<div className="surface empty"><h2>Your favorites are safely saved.</h2><p>Restore access with Premium. Your saved recipes remain safe.</p><button className="secondary" onClick={()=>navigate('Plans')}>View plans</button></div>:<><p className="muted">Save up to 10 recipes. Showing {favorites.length}.</p>{favorites.length?<div className="recipecards">{RECIPES.filter(r=>favorites.includes(r.id)).sort((a,b)=>favorites.indexOf(a.id)-favorites.indexOf(b.id)).map(r=><article className="recipecard" key={r.id}><div className="foodart"><span>{r.emoji}</span></div><div className="cardbody"><h3>{r.name}</h3><p>{r.minutes} min</p><button className="view" onClick={()=>setRecipe(r)}>View recipe →</button></div></article>)}</div>:<div className="surface empty">♡<h2>Keep your favourites close.</h2><p>Tap the heart on any recipe to save it here.</p></div>}{!showMoreFavorites&&favorites.length===5&&<button className="secondary" onClick={async()=>{if(!user)return;try{const more=await savedItems('favorites','recent',10);setFavorites(more.favorites);setShowMoreFavorites(true);}catch(e){setFailure(errorText(e));}}}>Load more favorites</button>}</>}</section>:
<section className="content"><span className="eyebrow">YOUR ACCOUNT</span><h1>My profile.</h1><div className="surface identity">{user.photoURL&&<img src={user.photoURL} alt="Profile"/>}<div><strong>{user.displayName}</strong><p>{user.email}</p><small>Google account connected</small></div></div><div className="surface"><h2>Household & food preferences</h2>{preferences}<div className="actions"><button className="primary" disabled={saving} onClick={()=>void saveProfile()}>{saving?'Saving…':'Save changes'}</button></div></div><div className="surface"><h2>Plan & account</h2><p>Plan: {access.tier==='trial'?'30-day trial':access.tier==='paid'?'Premium':'Free'} · {access.aiDailyLimit} AI requests per day. <button className="secondary" onClick={()=>navigate('Plans')}>Compare plans & upgrade →</button> <button className="secondary" disabled={refreshingAccess} onClick={()=>void refreshSubscription()}>↻ Refresh subscription</button></p><button className="secondary" onClick={async()=>{try{await signOut(auth);}catch(error){setFailure(errorText(error));}}}>Sign out</button></div></section>}{sharedFooter}</main><nav className="mobiletabs">{(['Home','Pantry','History','Favorites','Profile'] as Page[]).map(p=><button key={p} className={page===p?'active':''} onClick={()=>navigate(p)}><span>{p==='Home'?'🏠':p==='Pantry'?'🧺':p==='History'?'🕘':p==='Favorites'?'💚':'⚙️'}</span>{p}</button>)}</nav></div>;
}
