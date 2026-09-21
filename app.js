/* Nearby — conversational intro + endless draggable node canvas */
(function(){
const $=(s,r)=>(r||document).querySelector(s);
const app=$("#app");
const TOPICS=CATS.filter(c=>!c.soon);
const DAYS={sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
const state={loc:"",need:"",userCoords:null,branches:[],collapsed:{},pos:{},tx:0,ty:0,sc:.9,_init:false};

function svg(p,cls){return `<svg ${cls?`class="${cls}" `:""}viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${p}</svg>`;}
function esc(s){return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function catIcon(cat){const v=CAT_ICON[cat];if(typeof v==="number")return CATS[v].icon;if(typeof v==="string")return v;return TOPICS[0].icon;}
function topicByKey(k){return TOPICS.find(t=>t.key===k);}
const SPARK='<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9z"/>';
const PIN='<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>';
const ARROW='<path d="M5 12h14M13 6l6 6-6 6"/>';
const NAV='<path d="m3 11 19-9-9 19-2-8-8-2Z"/>';
const RESTART='<path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/>';

/* ---- open-now ---- */
function parseTime(t){const m=t.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);if(!m)return null;let h=+m[1],mi=m[2]?+m[2]:0;const ap=(m[3]||"").toLowerCase();if(ap==="pm"&&h<12)h+=12;if(ap==="am"&&h===12)h=0;return h*60+mi;}
function computeStatus(p){const h=p.hours.toLowerCase();if(/vary|call to confirm|seasonal|apply by phone/.test(h))return "varies";const now=new Date(),d=now.getDay(),mins=now.getHours()*60+now.getMinutes();let md=false;for(const seg of p.hours.split(";")){const dm=seg.match(/(sun|mon|tue|wed|thu|fri|sat)[a-z]*(?:\s*[–-]\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*)?/i);if(!dm)continue;const a=DAYS[dm[1].toLowerCase().slice(0,3)],b=dm[2]?DAYS[dm[2].toLowerCase().slice(0,3)]:DAYS[dm[1].toLowerCase().slice(0,3)];if(a==null||b==null)continue;const inD=a<=b?(d>=a&&d<=b):(d>=a||d<=b);if(!inD)continue;md=true;const tm=seg.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[–-]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);if(!tm)continue;let s=parseTime(tm[1]),e=parseTime(tm[2]);if(s==null||e==null)continue;if(!/am|pm/i.test(tm[1])&&/am|pm/i.test(tm[2])&&s>e)s-=720;if(mins>=s&&mins<=e)return "open";}return md?"closed":"varies";}
function statusLine(st){return st==="open"?"Open now":st==="varies"?"Hours vary — call to confirm":"Closed right now";}
function haversine(a,b){const R=3958.8,dLat=(b[0]-a[0])*Math.PI/180,dLng=(b[1]-a[1])*Math.PI/180,la1=a[0]*Math.PI/180,la2=b[0]*Math.PI/180;const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function geocode(q){
  q=(q||"").replace(/,?\s*detroit,?\s*(mi)?\b/ig,"").trim();
  const seen=new Set(),tries=[];
  [q].concat(q.split(/\s*(?:&|\band\b|,|\/|\bat\b)\s*/i)).forEach(p=>{const s=(p||"").trim();if(s.length>2&&!seen.has(s.toLowerCase())){seen.add(s.toLowerCase());tries.push(s);}});
  let i=0;
  function attempt(){
    if(i>=tries.length)return Promise.resolve(null);
    const term=tries[i++];
    return fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q="+encodeURIComponent(term+", Detroit, MI"))
      .then(r=>r.json()).then(a=>(a&&a[0])?[parseFloat(a[0].lat),parseFloat(a[0].lon)]:attempt()).catch(()=>attempt());
  }
  return attempt();
}
function placesFor(key){let list=PLACES.filter(p=>p.layer.includes(key)).map(p=>({...p,_st:computeStatus(p),_dist:(state.userCoords&&p.coords)?haversine(state.userCoords,p.coords):null}));if(state.userCoords)list.sort((a,b)=>(a._dist==null?999:a._dist)-(b._dist==null?999:b._dist));return list;}

/* ---- intent ---- */
const INTENT=[["food",/food|eat|meal|hungry|pantr|groc|ebt|snap|bread|dinner|lunch|breakfast|fridge|feed|cheap food/],["utility",/bill|dte|util|water|gas|electric|shut|heat|power|energy|lihe?ap|meap|fuel/],["housing",/rent|evict|hous|shelter|home|landlord|foreclos|mortgage|apartment|deposit/],["kids",/kid|child|librar|\brec\b|youth|family|after.?school|teen|book|story|daycare|baby|diaper/],["jobs",/job|work|hire|hiring|employ|career|resume|unemploy|interview|training/],["money",/money|benefit|\btax|cash|credit|eitc|assist|financ|refund|discount/],["health",/health|clinic|doctor|medic|dental|vision|mental|therap|sick|nurse|prescri|dentist/]];
function parseNeed(t){t=(t||"").toLowerCase();for(const[k,re]of INTENT)if(re.test(t))return k;return null;}
function isEverything(t){return /every|all of it|show me all|everything/.test((t||"").toLowerCase());}

/* ================= INTRO ================= */
let thread,introInput;
function scrollThread(){thread.scrollTop=thread.scrollHeight;}
function addAI(html,lead){const b=document.createElement("div");b.className="bubble ai";b.innerHTML=lead?`<span class="lead">${html}</span>`:html;thread.appendChild(b);scrollThread();return b;}
function addMe(t){const b=document.createElement("div");b.className="bubble me";b.textContent=t;thread.appendChild(b);scrollThread();return b;}
function addTyping(){const b=document.createElement("div");b.className="bubble ai";b.innerHTML='<span class="typing"><i></i><i></i><i></i></span>';thread.appendChild(b);scrollThread();return b;}

function renderIntro(){
  state._init=false;state.branches=[];state.collapsed={};state.pos={};
  app.innerHTML=`<section class="screen on"><div class="intro"><div class="introwrap">
    <div class="introhead"><h1>Hey — <em>what do you need?</em></h1><p>Tell me, and I'll find what's open near you.</p></div>
    <div class="thread" id="thread"></div>
    <div id="introInput"></div>
    <div class="qhints" id="qhints"></div>
  </div></div></section>`;
  thread=$("#thread");introInput=$("#introInput");
  addAI("Hi, I'm Nearby.",true);
  setTimeout(()=>{addAI("Where are you? An address or cross streets works.");showLocInput();},430);
}
function showLocInput(){
  introInput.innerHTML=`<div class="introbar">${svg(PIN,'lead-ic')}<input id="ib" placeholder="Your address or cross streets" value="${esc(loadCtx().neighborhood||"")}" autocomplete="off" /><button class="useloc" id="ubtn">${svg(NAV)} Use my location</button><button class="send" id="sbtn">${svg(ARROW)}</button></div>`;
  $("#qhints").innerHTML="";
  const go=()=>handleLoc($("#ib").value.trim());
  $("#sbtn").onclick=go;$("#ib").addEventListener("keydown",e=>{if(e.key==="Enter")go();});$("#ib").focus();
  $("#ubtn").onclick=()=>{if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>{state.userCoords=[p.coords.latitude,p.coords.longitude];},()=>{},{timeout:4000});handleLoc("Near me");};
}
function handleLoc(v){
  state.loc=v||"Detroit";addMe(state.loc);introInput.innerHTML="";
  if(state.loc!=="Near me"){state.userCoords=null;geocode(state.loc).then(c=>{if(c)state.userCoords=c;});}
  const t=addTyping();
  setTimeout(()=>{t.remove();addAI("What do you need? Say it in your own words, or ask to see everything.");showNeedInput();},820);
}
function showNeedInput(){
  introInput.innerHTML=`<div class="introbar">${svg(SPARK,'lead-ic')}<input id="nb" placeholder="e.g. food tonight, help with a bill, a job" autocomplete="off" /><button class="send" id="nsend">${svg(ARROW)}</button></div>`;
  const hints=[["Food tonight","food tonight"],["Help with a bill","help with a bill"],["A job","a job near me"],["Everything","everything"]];
  $("#qhints").innerHTML=hints.map((h,i)=>`<div class="qhint" data-i="${i}">${h[0]}</div>`).join("");
  $("#qhints").querySelectorAll(".qhint").forEach((el,i)=>el.onclick=()=>handleNeed(hints[i][1]));
  const go=()=>handleNeed($("#nb").value.trim());
  $("#nsend").onclick=go;$("#nb").addEventListener("keydown",e=>{if(e.key==="Enter")go();});$("#nb").focus();
}
function handleNeed(v){
  state.need=v;addMe(v||"Everything nearby");introInput.innerHTML="";$("#qhints").innerHTML="";
  const t=addTyping();
  setTimeout(()=>{t.remove();addAI(`Mapping what's open near <em>${esc(state.loc)}</em>…`);runLoader(()=>{location.hash="#/canvas";});},780);
}

/* ================= LOADER ================= */
function runLoader(cb){
  const steps=["Reading your area","Finding what's open","Placing it on your canvas"];
  const lo=$("#loader");
  lo.innerHTML=`<div class="loadcard glass"><div class="lh"><div class="spinner"></div><div><div class="lt">Building your canvas</div><div class="lsub">${esc(state.loc)}</div></div></div><div class="steps">${steps.map(s=>`<div class="step"><span class="sd">${svg('<path d="M5 12l4 4 10-10"/>')}</span><span>${s}</span><span class="pulse"></span></div>`).join("")}</div></div>`;
  lo.classList.add("on");const els=[...lo.querySelectorAll(".step")];let i=0;els[0].classList.add("active");
  const iv=setInterval(()=>{els[i].classList.remove("active");els[i].classList.add("done");i++;if(i<els.length)els[i].classList.add("active");else{clearInterval(iv);setTimeout(()=>{lo.classList.remove("on");cb();},360);}},680);
}

/* ================= CANVAS ================= */
let vp,world,wires,nodePos,edges;
function polar(a,r){return [Math.cos(a)*r,Math.sin(a)*r];}
function shortLoc(){const l=state.loc||"Detroit";return l.length>18?"You are here":l;}

function renderCanvas(){
  if(!state._init){
    state.branches=[];state.collapsed={};state.pos={};
    if(isEverything(state.need))state.branches=TOPICS.map(t=>t.key);
    else{const k=parseNeed(state.need);if(k)state.branches=[k];}
    state._init=true;
  }
  if(!state.boardId)state.boardId="b"+Date.now();persistBoard();renderSidebar("canvas");
  const worldHtml=`<div class="cv-world" id="world"><div class="cv-dots"></div><svg id="cvwires"></svg></div><div class="cv-zoom"><button id="zin">${svg('<path d="M12 5v14M5 12h14"/>')}</button><button id="zout">${svg('<path d="M5 12h14"/>')}</button><button id="zfit">${svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}</button></div>`;
  app.innerHTML=`<div class="cv-viewport" id="vp">
    <div class="cv-top">
      <span class="cv-recap">${svg(PIN)} ${esc(state.loc||"Detroit")}</span>
      <div class="cv-viewtoggle">
        <button data-mv="0" class="${!state.mapView?"on":""}">${svg('<circle cx="6" cy="6" r="2.3"/><circle cx="18" cy="7" r="2.3"/><circle cx="13" cy="17" r="2.3"/>')} Canvas</button>
        <button data-mv="1" class="${state.mapView?"on":""}">${svg('<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/>')} Map</button>
      </div>
    </div>
    ${state.mapView?'<div id="cvmap"></div>':worldHtml}
    <div class="cv-toast" id="toast"></div>
    ${(!state.mapView&&!state.branches.length)?'<div class="cv-empty">Ask for anything below and it appears here.</div>':''}
    <div class="cv-chat">${svg(SPARK,'ai')}<input id="cvq" placeholder="Ask for more: a job, help with rent, a clinic" autocomplete="off" /><button class="send" id="cvsend">${svg(ARROW)}</button></div>
  </div>`;
  vp=$("#vp");
  document.querySelectorAll(".cv-viewtoggle button").forEach(b=>b.onclick=()=>{state.mapView=b.dataset.mv==="1";renderCanvas();});
  if(state.mapView){renderCanvasMap();}
  else{world=$("#world");wires=$("#cvwires");buildWorld(true);wirePanZoom();$("#zin").onclick=()=>zoomBy(1.2);$("#zout").onclick=()=>zoomBy(1/1.2);$("#zfit").onclick=()=>fitContent(true);}
  const q=$("#cvq"),go=()=>{const v=q.value.trim();if(!v)return;q.value="";handleQuery(v);};
  $("#cvsend").onclick=go;q.addEventListener("keydown",e=>{if(e.key==="Enter")go();});
}
let _cvmap;
function allPlaces(){const seen={},out=[];state.branches.forEach(k=>placesFor(k).forEach(p=>{if(!seen[p.id]){seen[p.id]=1;out.push(p);}}));return out;}
function renderCanvasMap(){
  if(typeof L==="undefined")return;const el=$("#cvmap");if(!el)return;
  if(_cvmap){_cvmap.remove();_cvmap=null;}
  _cvmap=L.map(el,{zoomControl:true,attributionControl:true}).setView(state.userCoords||[42.3568,-83.0723],12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(_cvmap);
  const grp=[];
  allPlaces().filter(p=>p.coords).forEach(p=>{
    const ic=L.divIcon({className:"",html:`<div class="pinmark"><span>${svg(catIcon(p.category))}</span></div>`,iconSize:[30,30],iconAnchor:[15,30]});
    const m=L.marker(p.coords,{icon:ic}).addTo(_cvmap);m.bindTooltip(p.name,{direction:"top"});m.on("click",()=>openDetail(p));grp.push(p.coords);
  });
  if(state.userCoords){L.circleMarker(state.userCoords,{radius:8,color:"#fff",weight:2,fillColor:"#14151a",fillOpacity:1}).addTo(_cvmap).bindTooltip("You");grp.push(state.userCoords);}
  if(grp.length)_cvmap.fitBounds(grp,{padding:[60,60],maxZoom:14});
}

function computeGraph(){
  nodePos={};edges=[];
  nodePos["center"]=state.pos["center"]||[0,0];
  const right=[],left=[];
  state.branches.forEach((k,i)=>{(i%2===0?right:left).push(k);});
  layoutSide(right,1);layoutSide(left,-1);
  function layoutSide(list,side){
    if(!list.length)return;
    const gap=104,rowGap=70;
    const heights=list.map(k=>Math.max(84,(state.collapsed[k]?0:placesFor(k).length)*gap));
    const total=heights.reduce((a,b)=>a+b,0)+(list.length-1)*rowGap;
    let y=-total/2;
    list.forEach((k,idx)=>{
      const h=heights[idx],ty=y+h/2,P=state.pos[k]||[side*340,ty];
      nodePos[k]=P;edges.push({a:"center",b:k,beam:false});
      if(!state.collapsed[k]){
        const pl=placesFor(k),px=P[0]+side*300;
        pl.forEach((place,j)=>{const id="p:"+place.id,py=P[1]+(j-(pl.length-1)/2)*gap;nodePos[id]=state.pos[id]||[px,py];edges.push({a:k,b:id,beam:true});});
      }
      y+=h+rowGap;
    });
  }
}
function buildWorld(animate){
  computeGraph();
  [...world.querySelectorAll(".cnode")].forEach(n=>n.remove());
  let d=0;
  const L=state.loc||"Detroit",ls=L.length>22?L.slice(0,21)+"…":L;
  const c=mkNode("n-center","center",`<span class="ct">You</span><span class="cs">${esc(ls)}</span>`,d);makeDraggable(c,"center",null);
  state.branches.forEach(key=>{
    const t=topicByKey(key),open=!state.collapsed[key],cnt=PLACES.filter(p=>p.layer.includes(key)).length;
    d+=.06;const te=mkNode("n-topic"+(open?" open":""),key,`<span class="ti">${svg(t.icon)}</span><span class="tmeta"><span class="tn">${t.name}</span><span class="tc">${cnt} nearby</span></span>`,d);
    makeDraggable(te,key,()=>{state.collapsed[key]=!state.collapsed[key];buildWorld(true);persistBoard();});
    if(open){placesFor(key).forEach(pl=>{d+=.05;const id="p:"+pl.id;const pe=mkNode("n-place",id,`<div class="r1"><span class="pi">${svg(catIcon(pl.category))}</span><span class="pn">${esc(pl.name)}</span></div><div class="r2"><span class="sdot ${pl._st}"></span><span class="st">${pl._dist!=null?pl._dist.toFixed(1)+" mi · ":""}${statusLine(pl._st)}</span></div>`,d);makeDraggable(pe,id,()=>openDetail(pl));});}
  });
  drawWires(animate);
  applyTransform();
  if(animate&&!state._fitted){state._fitted=true;fitContent(false);}
}
function mkNode(cls,id,html,delay){const el=document.createElement("div");el.className="cnode "+cls;const p=nodePos[id];el.style.left=p[0]+"px";el.style.top=p[1]+"px";el.innerHTML=html;el.style.animationDelay=(delay||0)+"s";el.classList.add("in");world.appendChild(el);return el;}

function drawWires(animate){
  wires.innerHTML='<defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9cdd6"/><stop offset="1" stop-color="#8b90a0"/></linearGradient><filter id="bg" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#cfd6e4" flood-opacity="0.9"/></filter></defs>';
  edges.forEach((e,i)=>{const A=nodePos[e.a],B=nodePos[e.b];if(!A||!B)return;addWire(A[0],A[1],B[0],B[1],e.beam,animate,i*.08);});
}
function wirePath(x1,y1,x2,y2){const O=4000,cx=(x1+x2)/2;return `M${x1+O},${y1+O} C${cx+O},${y1+O} ${cx+O},${y2+O} ${x2+O},${y2+O}`;}
function addWire(x1,y1,x2,y2,beam,animate,delay){
  const p=document.createElementNS("http://www.w3.org/2000/svg","path");p.setAttribute("d",wirePath(x1,y1,x2,y2));p.setAttribute("fill","none");p.setAttribute("stroke","url(#wg)");p.setAttribute("stroke-width","2");p.setAttribute("stroke-linecap","round");p.setAttribute("opacity","0.9");wires.appendChild(p);
  if(animate){const len=p.getTotalLength();p.style.strokeDasharray=len;p.style.strokeDashoffset=len;p.style.transition=`stroke-dashoffset .6s ease ${delay}s`;requestAnimationFrame(()=>{p.style.strokeDashoffset=0;});}
  if(beam){const b=document.createElementNS("http://www.w3.org/2000/svg","path");b.setAttribute("d",wirePath(x1,y1,x2,y2));b.setAttribute("fill","none");b.setAttribute("stroke","#fff");b.setAttribute("stroke-width","2.8");b.setAttribute("stroke-linecap","round");b.setAttribute("filter","url(#bg)");wires.appendChild(b);const bl=b.getTotalLength();b.style.strokeDasharray="13 "+bl;b.animate([{strokeDashoffset:0},{strokeDashoffset:-(bl+13)}],{duration:1600,iterations:Infinity,easing:"linear",delay:animate?600:0});}
}

/* pan / zoom / drag */
function applyTransform(smooth){world.style.transition=smooth?"transform .5s cubic-bezier(.16,1,.3,1)":"none";world.style.transform=`translate(${state.tx}px,${state.ty}px) scale(${state.sc})`;}
function zoomBy(f){const c=vp.getBoundingClientRect();zoomAt(c.width/2,c.height/2,state.sc*f);}
function zoomAt(sx,sy,ns){ns=Math.max(.35,Math.min(2.4,ns));const c=vp.getBoundingClientRect();const cx=sx-c.width/2,cy=sy-c.height/2,wx=(cx-state.tx)/state.sc,wy=(cy-state.ty)/state.sc;state.sc=ns;state.tx=cx-wx*ns;state.ty=cy-wy*ns;applyTransform();}
function panToWorld(wx,wy){state.tx=-wx*state.sc;state.ty=-wy*state.sc;applyTransform(true);}
function fitContent(smooth){const xs=Object.values(nodePos).map(p=>p[0]),ys=Object.values(nodePos).map(p=>p[1]);if(!xs.length){state.tx=0;state.ty=0;state.sc=.9;return applyTransform(smooth);}const minX=Math.min(...xs)-150,maxX=Math.max(...xs)+150,minY=Math.min(...ys)-90,maxY=Math.max(...ys)+90,w=maxX-minX,h=maxY-minY,r=vp.getBoundingClientRect();state.sc=Math.max(.4,Math.min(1.05,Math.min((r.width-90)/w,(r.height-230)/h)));const cx=(minX+maxX)/2,cy=(minY+maxY)/2;state.tx=-cx*state.sc;state.ty=-cy*state.sc;applyTransform(smooth);}
let rafP=false;function redrawSoon(){if(rafP)return;rafP=true;requestAnimationFrame(()=>{rafP=false;drawWires(false);});}
function makeDraggable(el,id,onClick){
  let down=false,moved=false,sx=0,sy=0,ex=0,ey=0;
  el.addEventListener("pointerdown",e=>{e.stopPropagation();down=true;moved=false;sx=e.clientX;sy=e.clientY;const p=nodePos[id];ex=p[0];ey=p[1];try{el.setPointerCapture(e.pointerId);}catch(_){}el.style.cursor="grabbing";});
  el.addEventListener("pointermove",e=>{if(!down)return;const dx=(e.clientX-sx)/state.sc,dy=(e.clientY-sy)/state.sc;if(Math.abs(dx)>3||Math.abs(dy)>3)moved=true;const nx=ex+dx,ny=ey+dy;nodePos[id]=[nx,ny];state.pos[id]=[nx,ny];el.style.left=nx+"px";el.style.top=ny+"px";redrawSoon();});
  el.addEventListener("pointerup",e=>{if(!down)return;down=false;el.style.cursor="";if(!moved&&onClick)onClick();else if(moved)persistBoard();});
}
function wirePanZoom(){
  let panning=false,sx=0,sy=0,ox=0,oy=0;
  vp.addEventListener("pointerdown",e=>{if(e.target.closest(".cnode")||e.target.closest(".cv-chat")||e.target.closest(".cv-zoom")||e.target.closest(".cv-top"))return;panning=true;vp.classList.add("grabbing");sx=e.clientX;sy=e.clientY;ox=state.tx;oy=state.ty;try{vp.setPointerCapture(e.pointerId);}catch(_){}});
  vp.addEventListener("pointermove",e=>{if(!panning)return;state.tx=ox+(e.clientX-sx);state.ty=oy+(e.clientY-sy);applyTransform();});
  const end=()=>{panning=false;vp.classList.remove("grabbing");};
  vp.addEventListener("pointerup",end);vp.addEventListener("pointercancel",end);
  vp.addEventListener("wheel",e=>{e.preventDefault();const c=vp.getBoundingClientRect();zoomAt(e.clientX-c.left,e.clientY-c.top,state.sc*(e.deltaY<0?1.1:1/1.1));},{passive:false});
}

/* canvas chat */
let toastT;
function toast(msg){const t=$("#toast");if(!t)return;t.innerHTML=msg;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2800);}
function handleQuery(v){
  const emp=$(".cv-empty");if(emp)emp.remove();
  if(isEverything(v)){state.branches=TOPICS.map(t=>t.key);state.branches.forEach(k=>state.collapsed[k]=false);persistBoard();renderSidebar("canvas");if(state.mapView)renderCanvasMap();else{buildWorld(true);fitContent(true);}return toast("Here's everything nearby.");}
  const k=parseNeed(v);
  if(!k)return toast("I don't have that yet. Try food, jobs, bills, housing, kids, money, or health.");
  const t=topicByKey(k),cnt=PLACES.filter(p=>p.layer.includes(k)).length;
  if(!state.branches.includes(k))state.branches.push(k);state.collapsed[k]=false;
  persistBoard();renderSidebar("canvas");if(state.mapView)renderCanvasMap();else{buildWorld(true);fitContent(true);}
  toast(`${cnt} ${t.name.toLowerCase()} connected to you`);
}

/* ================= DETAIL MODAL ================= */
function mapsUrl(a){return "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(a);}
function openDetail(p){
  const st=p._st||computeStatus(p),stc=st==="open"?"var(--ok)":st==="varies"?"var(--warn)":"var(--closed)";
  const ov=$("#overlay");
  ov.innerHTML=`<div class="detail glass"><button class="x" id="dx">${svg('<path d="M18 6 6 18M6 6l12 12"/>')}</button>
    <div class="dh"><span class="dbadge">${svg(catIcon(p.category))}</span><div class="dt"><div class="dtags"><span class="tag">${esc(p.category)}</span>${p.phone?"":'<span class="tag">Walk-in</span>'}<span class="tag">Detroit</span></div><h2>${esc(p.name)}</h2><p class="payoff">${p._dist!=null?p._dist.toFixed(1)+" mi away · ":""}${esc(p.neighborhood)}</p></div></div>
    <span class="dstatus"><span class="sdot ${st}" style="background:${stc}"></span>${statusLine(st)}</span>
    <div class="dsec"><h3>What they offer</h3><p class="dnote">${esc(p.note)}</p></div>
    <div class="dsec"><h3>Hours & location</h3>
      <div class="drow">${svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}<span>${esc(p.hours)}</span></div>
      <div class="drow">${svg(PIN)}<span>${esc(p.address)}</span></div>
      ${p.phone?`<div class="drow">${svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.1 9.6a16 16 0 0 0 6 6l1.2-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z"/>')}<span>${esc(p.phone)}</span></div>`:""}
      ${p.coords?'<div class="dmap" id="dmap"></div>':""}</div>
    ${p.bring?`<div class="dsec"><h3>What to bring</h3><div class="drow">${svg('<path d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>')}<span>${esc(p.bring)}</span></div></div>`:""}
    <div class="verified">${svg('<path d="M9 12l2 2 4-4M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>')} Checked Sep 20, 2026 — always verify with the organization.</div>
    <div class="dactions">${p.phone?`<a class="btn ghost" href="tel:${p.phone.replace(/[^0-9]/g,"")}">${svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.1 9.6a16 16 0 0 0 6 6l1.2-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z"/>')}Call</a>`:""}<a class="btn dark" href="${mapsUrl(p.address)}" target="_blank" rel="noopener">${svg(NAV)}Directions</a></div></div>`;
  ov.classList.add("on");
  $("#dx").onclick=closeDetail;ov.onclick=e=>{if(e.target===ov)closeDetail();};
  if(p.coords&&typeof L!=="undefined")requestAnimationFrame(()=>{const dm=L.map("dmap",{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false}).setView(p.coords,15);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(dm);L.marker(p.coords,{icon:L.divIcon({className:"",html:'<div class="pinmark"><span></span></div>',iconSize:[30,30],iconAnchor:[15,30]})}).addTo(dm);});
}
function closeDetail(){$("#overlay").classList.remove("on");}
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDetail();});

/* ================= STAGE 2: boards, context, sidebar, home ================= */
function loadBoards(){try{return JSON.parse(localStorage.getItem("nearby.boards")||"[]")}catch(_){return[]}}
function saveBoards(b){try{localStorage.setItem("nearby.boards",JSON.stringify(b))}catch(_){}}
function upsertBoard(bd){const b=loadBoards(),i=b.findIndex(x=>x.id===bd.id);if(i>=0)b.splice(i,1);b.unshift(bd);saveBoards(b.slice(0,40));}
function deleteBoard(id){saveBoards(loadBoards().filter(x=>x.id!==id));}
function loadCtx(){try{return JSON.parse(localStorage.getItem("nearby.context")||"{}")}catch(_){return{}}}
function saveCtx(c){try{localStorage.setItem("nearby.context",JSON.stringify(c))}catch(_){}}
function ago(ts){const s=(Date.now()-ts)/1000;if(s<60)return"just now";if(s<3600)return Math.floor(s/60)+"m ago";if(s<86400)return Math.floor(s/3600)+"h ago";return Math.floor(s/86400)+"d ago";}
function titleFor(){let n=(state.need||"").trim();if(!n||isEverything(n))n="Everything";n=n.charAt(0).toUpperCase()+n.slice(1);return n+" · "+(state.loc||"Detroit");}
function persistBoard(){if(!state.boardId)return;upsertBoard({id:state.boardId,title:titleFor(),loc:state.loc,need:state.need,branches:state.branches.slice(),collapsed:Object.assign({},state.collapsed),pos:Object.assign({},state.pos),ts:Date.now()});}
function openBoard(id){const bd=loadBoards().find(x=>x.id===id);if(!bd){location.hash="#/";return;}state.boardId=bd.id;state.loc=bd.loc;state.need=bd.need;state.branches=(bd.branches||[]).slice();state.collapsed=Object.assign({},bd.collapsed);state.pos=Object.assign({},bd.pos);state._init=true;state._fitted=false;state.tx=0;state.ty=0;state.sc=.9;if((location.hash||"")==="#/canvas")renderCanvas();else location.hash="#/canvas";}

function renderSidebar(active){
  const sb=$("#sidebar"),boards=loadBoards();
  sb.innerHTML=`
    <div class="sb-brand" id="sbBrand"><span class="mk">${svg(PIN)}</span>Nearby</div>
    <div class="sb-modes"><button data-m="browse" class="${(active==="new"||active==="canvas")?"":"on"}">Browse</button><button data-m="build" class="${(active==="new"||active==="canvas")?"on":""}">Build</button></div>
    <button class="sb-new" id="sbNew">${svg('<path d="M12 5v14M5 12h14"/>')} New search</button>
    <nav class="sb-nav">
      <div class="sb-item${active==="home"?" on":""}" data-v="home">${svg('<path d="M4 11 12 4l8 7M6 10v9h12v-9"/>')} Home</div>
      <div class="sb-item${active==="context"?" on":""}" data-v="context">${svg('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>')} Context</div>
    </nav>
    <div class="sb-label">Recent searches</div>
    <div class="sb-boards">${boards.length?boards.map(b=>`<div class="sb-board${b.id===state.boardId&&active==="canvas"?" on":""}" data-id="${b.id}"><div class="bt"><div class="bn">${esc(b.title)}</div><div class="bd">${ago(b.ts)}</div></div><button class="del" data-del="${b.id}">${svg('<path d="M18 6 6 18M6 6l12 12"/>')}</button></div>`).join(""):'<div class="sb-empty2">No searches yet. Start one and it saves here.</div>'}</div>
    <div class="sb-foot"><span class="d"></span>Detroit · demo</div>`;
  $("#sbBrand").onclick=()=>{location.hash="#/";};
  $("#sbNew").onclick=()=>{state.boardId=null;state._init=false;location.hash="#/new";};
  sb.querySelectorAll(".sb-modes button").forEach(el=>el.onclick=()=>{if(el.dataset.m==="build"){const bs=loadBoards();if(bs.length)openBoard(bs[0].id);else{state.boardId=null;state._init=false;location.hash="#/new";}}else location.hash="#/";});
  sb.querySelectorAll(".sb-item").forEach(el=>el.onclick=()=>{location.hash="#/"+el.dataset.v;});
  sb.querySelectorAll(".sb-board").forEach(el=>el.onclick=e=>{if(e.target.closest(".del"))return;openBoard(el.dataset.id);});
  sb.querySelectorAll(".del").forEach(el=>el.onclick=e=>{e.stopPropagation();deleteBoard(el.dataset.del);if(state.boardId===el.dataset.del)state.boardId=null;renderSidebar(active);});
}

function renderHome(){
  const boards=loadBoards(),openNow=PLACES.filter(p=>computeStatus(p)==="open").length;
  app.innerHTML=`<section class="screen on"><div class="home2">
    <div class="eyebrow">${svg(SPARK)} Your neighborhood, on a canvas</div>
    <h1>Find what's open <em>near you</em>.</h1>
    <p class="lede">Nearby maps free and low-cost help across Detroit — food, bills, housing, jobs, health — as a canvas you explore, drag, and grow by asking.</p>
    <div class="steps3">
      <div class="step3 glass"><div class="num">1</div><h4>Say where & what</h4><p>Tell Nearby where you are and what you need, in your own words.</p></div>
      <div class="step3 glass"><div class="num">2</div><h4>See it appear</h4><p>Real, open places map out around you, all connected to you.</p></div>
      <div class="step3 glass"><div class="num">3</div><h4>Tap for details</h4><p>Hours, what to bring, who qualifies, and directions.</p></div>
    </div>
    <button class="cta" id="homeNew">${svg('<path d="M12 5v14M5 12h14"/>')} Start a search</button>
    <div class="insights">
      <div class="sb-label" style="padding-left:0">Detroit right now</div>
      <div class="insightgrid">
        <div class="istat glass"><div class="iv">${PLACES.length}</div><div class="il">verified places</div></div>
        <div class="istat glass"><div class="iv">${openNow}</div><div class="il">open right now</div></div>
        <div class="istat glass"><div class="iv">${TOPICS.length}</div><div class="il">categories</div></div>
      </div>
      <div class="catrow">${TOPICS.map(t=>`<span class="catpill">${svg(t.icon)} ${t.name} · ${PLACES.filter(p=>p.layer.includes(t.key)).length}</span>`).join("")}</div>
    </div>
    ${boards.length?`<div class="recent"><div class="sb-label">Recent searches</div><div class="recentgrid">${boards.slice(0,6).map(b=>`<div class="rcard glass" data-id="${b.id}"><div class="rn">${esc(b.title)}</div><div class="rd">${ago(b.ts)}</div></div>`).join("")}</div></div>`:""}
  </div></section>`;
  $("#homeNew").onclick=()=>{state.boardId=null;state._init=false;location.hash="#/new";};
  app.querySelectorAll(".rcard").forEach(el=>el.onclick=()=>openBoard(el.dataset.id));
}

function renderContext(){
  const c=loadCtx();
  const HH=["Just me","Family with kids","Seniors at home"],SIT=["Behind on bills","Looking for work","Need food now","No car"],BEN=["SNAP / EBT","Medicaid","WIC","None yet"];
  const chip=(arr,key,multi)=>arr.map(o=>`<div class="opt${(multi?(c[key]||[]).includes(o):c[key]===o)?" on":""}" data-key="${key}" data-val="${esc(o)}" data-multi="${multi?1:0}">${esc(o)}</div>`).join("");
  app.innerHTML=`<section class="screen on"><div class="ctx">
    <h1>Your <em>context</em></h1>
    <p class="lede">Tell Nearby a little about you and it tailors what surfaces first. This stays on your device.</p>
    <div class="field"><label>Neighborhood or area</label><input id="ctxN" placeholder="e.g. 7 Mile & Gratiot, or your ZIP" value="${esc(c.neighborhood||"")}" /></div>
    <div class="field"><label>Household</label><div class="opts">${chip(HH,"household",false)}</div></div>
    <div class="field"><label>Situation</label><div class="opts">${chip(SIT,"situation",true)}</div></div>
    <div class="field"><label>Benefits you already get</label><div class="opts">${chip(BEN,"benefits",true)}</div></div>
    <button class="save" id="ctxSave">${svg('<path d="M5 12l4 4 10-10"/>')} Save context</button><span class="saved" id="ctxSaved">Saved</span>
  </div></section>`;
  app.querySelectorAll(".opt").forEach(el=>el.onclick=()=>{const k=el.dataset.key,v=el.dataset.val,multi=el.dataset.multi==="1",cur=loadCtx();if(multi){cur[k]=cur[k]||[];const i=cur[k].indexOf(v);if(i>=0)cur[k].splice(i,1);else cur[k].push(v);}else{cur[k]=cur[k]===v?"":v;el.parentNode.querySelectorAll(".opt").forEach(o=>{if(o!==el)o.classList.remove("on");});}saveCtx(cur);el.classList.toggle("on");});
  $("#ctxSave").onclick=()=>{const cur=loadCtx();cur.neighborhood=$("#ctxN").value.trim();saveCtx(cur);const s=$("#ctxSaved");s.classList.add("on");setTimeout(()=>s.classList.remove("on"),1600);};
}

/* ---- router ---- */
function route(){
  const h=location.hash||"#/";
  let active="home";
  if(h==="#/context")active="context";else if(h==="#/canvas"||h.indexOf("#/board/")===0)active="canvas";else if(h==="#/new")active="new";
  renderSidebar(active);
  if(h.indexOf("#/board/")===0){openBoard(h.slice(8));return;}
  if(h==="#/new"){renderIntro();return;}
  if(h==="#/canvas"&&state.loc){state._fitted=false;renderCanvas();return;}
  if(h==="#/context"){renderContext();return;}
  renderHome();
}
window.addEventListener("hashchange",route);
if(!$("#overlay")){const o=document.createElement("div");o.className="overlay";o.id="overlay";document.body.appendChild(o);}
route();
})();
