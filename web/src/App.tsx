const snacks=[{name:'Vegetable Poha',meta:'15 min · Light & filling',tag:'Healthy'},{name:'Paneer Toast',meta:'12 min · Crispy & cheesy',tag:'Kids love it'},{name:'Masala Corn',meta:'10 min · Quick chai snack',tag:'Chai Time'}];

export default function App(){
  return <main className="shell">
    <header><div><span className="eyebrow">SORT YOUR EVENING</span><h1>Aaj kya banaye?</h1><p>Three easy ideas for your family. No endless scrolling.</p></div><button className="avatar" aria-label="Profile">R</button></header>
    <section className="chips"><button>10 min</button><button>Healthy</button><button>Kids</button><button>Chai Time</button></section>
    <section className="title"><h2>Today’s 3 picks</h2><span>Made for your evening</span></section>
    <section className="cards">{snacks.map((s,i)=><article className="card" key={s.name}><div className="number">0{i+1}</div><div className="food"><span className="tag">{s.tag}</span><h3>{s.name}</h3><p>{s.meta}</p><button className="recipe">See recipe →</button></div></article>)}</section>
    <button className="made">✓ I made something today</button>
    <nav><b>Home</b><span>History</span><span>Favorites</span><span>Profile</span></nav>
  </main>;
}