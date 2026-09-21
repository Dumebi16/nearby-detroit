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
function computeStatus(p,now=new Date()){
  const h=(p.hours||"").toLowerCase();
  if(!h||/vary|call to confirm|seasonal|apply by phone/.test(h))return "varies";
  if(/24\s*\/\s*7|24 hours/.test(h))return "open";
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Detroit",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const get=k=>parts.find(p=>p.type===k).value,d=DAYS[get("weekday").toLowerCase()],mins=+get("hour")*60 + +get("minute");
  let known=false,uncertain=false;
  for(const seg of h.split(";")){
    const dm=seg.match(/(sun|mon|tue|wed|thu|fri|sat)[a-z]*(?:\s*[–-]\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*)?/i);
    const tm=seg.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[–-]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if(!dm||!tm){uncertain=true;continue;}
    let start=tm[1],end=tm[2];
    if(!/am|pm/.test(start)){const suffix=end.match(/am|pm/);if(!suffix){uncertain=true;continue;}start+=suffix[0];}
    let a=parseTime(start),b=parseTime(end);if(a===null||b===null){uncertain=true;continue;}
    if(!/am|pm/.test(tm[1])&&a>b)a-=720;
    const first=DAYS[dm[1]],last=dm[2]?DAYS[dm[2]]:first,inDay=n=>first<=last?n>=first&&n<=last:n>=first||n<=last;
    known=true;
    if(b>a?inDay(d)&&mins>=a&&mins<b:(inDay(d)&&mins>=a)||(inDay((d+6)%7)&&mins<b))return "open";
  }
  return known&&!uncertain?"closed":"varies";
}
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
    return fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q="+encodeURIComponent(term+", Detroit, MI"),{signal:AbortSignal.timeout(6000)})
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
  state.boardId=null;state.mapView=false;state._fitted=false;state._init=false;state.branches=[];state.collapsed={};state.pos={};
  app.innerHTML=`<section class="screen on"><div class="intro"><div class="introwrap">
    <div class="introhead"><h1>Hey — <em>what do you need?</em></h1><p>Tell me, and I'll find what's open near you.</p></div>
    <div class="thread" id="thread"></div>
    <div id="introInput"></div>
    <div class="qhints" id="qhints"></div>
  </div></div></section>`;
  thread=$("#thread");introInput=$("#introInput");
  addAI("Hi, I'm Nearby.",true);
  const introThread=thread;setTimeout(()=>{if(thread!==introThread||!introThread.isConnected)return;addAI("Where are you? An address or cross streets works.");showLocInput();},430);
}
function showLocInput(){
  introInput.innerHTML=`<div class="introbar">${svg(PIN,'lead-ic')}<input id="ib" placeholder="Your address or cross streets" value="${esc(loadCtx().neighborhood||"")}" autocomplete="off" /><button class="useloc" id="ubtn">${svg(NAV)} Use my location</button><button class="send" id="sbtn" aria-label="Continue">${svg(ARROW)}</button></div>`;
  $("#qhints").innerHTML="";
  const go=()=>handleLoc($("#ib").value.trim());
  $("#sbtn").onclick=go;$("#ib").addEventListener("keydown",e=>{if(e.key==="Enter")go();});$("#ib").focus();
  $("#ubtn").onclick=()=>{const b=$("#ubtn");state.userCoords=null;if(!navigator.geolocation){b.textContent="Enter your location instead";return;}b.disabled=true;b.textContent="Locating…";navigator.geolocation.getCurrentPosition(p=>{if(!document.contains(b))return;state.userCoords=[p.coords.latitude,p.coords.longitude];handleLoc("Near me");},()=>{if(!document.contains(b))return;b.disabled=false;b.textContent="Location unavailable — enter an address";},{timeout:6000});};
}
function handleLoc(v){
  state.loc=v||"Detroit";addMe(state.loc);introInput.innerHTML="";
  if(state.loc!=="Near me"){state.userCoords=null;const loc=state.loc;geocode(loc).then(c=>{if(c&&state.loc===loc){state.userCoords=c;persistBoard();if($("#vp"))renderCanvas();}});}
  const t=addTyping();
  setTimeout(()=>{if(!t.isConnected)return;t.remove();addAI("What do you need? Say it in your own words, or ask to see everything.");if(state._pendNeed){const need=state._pendNeed;state._pendNeed=null;handleNeed(need);}else showNeedInput();},820);
}
function showNeedInput(){
  introInput.innerHTML=`<div class="introbar">${svg(SPARK,'lead-ic')}<input id="nb" placeholder="e.g. food tonight, help with a bill, a job" autocomplete="off" /><button class="send" id="nsend" aria-label="Find resources">${svg(ARROW)}</button></div>`;
  const hints=[["Food tonight","food tonight"],["Help with a bill","help with a bill"],["A job","a job near me"],["Everything","everything"]];
  $("#qhints").innerHTML=hints.map((h,i)=>`<div class="qhint" data-i="${i}">${h[0]}</div>`).join("");
  $("#qhints").querySelectorAll(".qhint").forEach((el,i)=>el.onclick=()=>handleNeed(hints[i][1]));
  const go=()=>handleNeed($("#nb").value.trim());
  $("#nsend").onclick=go;$("#nb").addEventListener("keydown",e=>{if(e.key==="Enter")go();});$("#nb").focus();
}
function handleNeed(v){
  state.need=v;addMe(v||"Everything nearby");introInput.innerHTML="";$("#qhints").innerHTML="";
  const t=addTyping();
  setTimeout(()=>{if(!t.isConnected)return;t.remove();addAI(`Mapping what's open near <em>${esc(state.loc)}</em>…`);runLoader(()=>{location.hash="#/canvas";});},780);
}

/* ================= LOADER ================= */
function runLoader(cb){
  const steps=["Reading your area","Finding what's open","Placing it on your canvas"];
  const lo=$("#loader"),sourceThread=thread;
  lo.innerHTML=`<div class="loadcard glass"><div class="lh"><div class="spinner"></div><div><div class="lt">Building your canvas</div><div class="lsub">${esc(state.loc)}</div></div></div><div class="steps">${steps.map(s=>`<div class="step"><span class="sd">${svg('<path d="M5 12l4 4 10-10"/>')}</span><span>${s}</span><span class="pulse"></span></div>`).join("")}</div></div>`;
  lo.classList.add("on");const els=[...lo.querySelectorAll(".step")];let i=0;els[0].classList.add("active");
  const iv=setInterval(()=>{if(!sourceThread.isConnected){clearInterval(iv);lo.classList.remove("on");return;}els[i].classList.remove("active");els[i].classList.add("done");i++;if(i<els.length)els[i].classList.add("active");else{clearInterval(iv);setTimeout(()=>{lo.classList.remove("on");if(sourceThread.isConnected)cb();},360);}},680);
}

/* ================= CANVAS ================= */
let vp,world,wires,nodePos,edges;
function polar(a,r){return [Math.cos(a)*r,Math.sin(a)*r];}
function shortLoc(){const l=state.loc||"Detroit";return l.length>18?"You are here":l;}

function renderCanvas(){
  if(!state._init){
    state.branches=[];state.collapsed={};state.pos={};
    if(isEverything(state.need))state.branches=TOPICS.map(t=>t.key);
    else{const k=parseNeed(state.need);state.branches=k?[k]:TOPICS.map(t=>t.key);}
    if(state.branches.length>1)state.branches.forEach(k=>state.collapsed[k]=true);
    state._init=true;
  }
  if(!state.boardId)state.boardId="b"+Date.now();persistBoard();renderSidebar("canvas");
  const worldHtml=`<div class="cv-world" id="world"><div class="cv-dots"></div><svg id="cvwires"></svg></div><div class="cv-zoom"><button id="zin" aria-label="Zoom in">${svg('<path d="M12 5v14M5 12h14"/>')}</button><button id="zout" aria-label="Zoom out">${svg('<path d="M5 12h14"/>')}</button><button id="zfit" aria-label="Fit canvas">${svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}</button></div>`;
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
    <div class="cv-chat">${svg(SPARK,'ai')}<input id="cvq" placeholder="Ask for more: a job, help with rent, a clinic" autocomplete="off" /><button class="send" id="cvsend" aria-label="Add to canvas">${svg(ARROW)}</button></div>
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
  if(innerWidth<=640&&state.branches.every(k=>state.collapsed[k])){
    nodePos.center=state.pos.center||[0,-260];
    state.branches.forEach((k,i)=>{nodePos[k]=state.pos[k]||[(i%2===0?-1:1)*100,-150+Math.floor(i/2)*115];edges.push({a:"center",b:k,beam:false});});return;
  }
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
        pl.forEach((place,j)=>{const id="p:"+k+":"+place.id,py=P[1]+(j-(pl.length-1)/2)*gap;nodePos[id]=state.pos[id]||[px,py];edges.push({a:k,b:id,beam:true});});
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
  const c=mkNode("n-center","center",`<span class="ct">Nearby</span><span class="cs">${esc(ls)}</span>`,d);makeDraggable(c,"center",null);
  state.branches.forEach(key=>{
    const t=topicByKey(key),open=!state.collapsed[key],cnt=PLACES.filter(p=>p.layer.includes(key)).length;
    d+=.06;const te=mkNode("n-topic"+(open?" open":""),key,`<span class="ti">${svg(t.icon)}</span><span class="tmeta"><span class="tn">${t.name}</span><span class="tc">${cnt} nearby</span></span>`,d);
    makeDraggable(te,key,()=>{state.collapsed[key]=!state.collapsed[key];buildWorld(true);fitContent(true);persistBoard();});
    if(open){placesFor(key).forEach(pl=>{d+=.05;const id="p:"+key+":"+pl.id;const pe=mkNode("n-place",id,`<div class="r1"><span class="pi">${svg(catIcon(pl.category))}</span><span class="pn">${esc(pl.name)}</span></div><div class="r2"><span class="sdot ${pl._st}"></span><span class="st">${pl._dist!=null?pl._dist.toFixed(1)+" mi · ":""}${statusLine(pl._st)}</span></div>`,d);makeDraggable(pe,id,()=>openDetail(pl));});}
  });
  drawWires(animate);
  applyTransform();
  if(animate&&!state._fitted){state._fitted=true;fitContent(false);}
}
function mkNode(cls,id,html,delay){const el=document.createElement("div");el.className="cnode "+cls;el.dataset.node=id;const p=nodePos[id];el.style.left=p[0]+"px";el.style.top=p[1]+"px";el.innerHTML=html;el.style.animationDelay=(delay||0)+"s";el.classList.add("in");world.appendChild(el);return el;}

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
function zoomAt(sx,sy,ns){ns=Math.max(.12,Math.min(2.4,ns));const c=vp.getBoundingClientRect();const cx=sx-c.width/2,cy=sy-c.height/2,wx=(cx-state.tx)/state.sc,wy=(cy-state.ty)/state.sc;state.sc=ns;state.tx=cx-wx*ns;state.ty=cy-wy*ns;applyTransform();}
function panToWorld(wx,wy){state.tx=-wx*state.sc;state.ty=-wy*state.sc;applyTransform(true);}
function fitContent(smooth){const xs=Object.values(nodePos).map(p=>p[0]),ys=Object.values(nodePos).map(p=>p[1]);if(!xs.length){state.tx=0;state.ty=0;state.sc=.9;return applyTransform(smooth);}const minX=Math.min(...xs)-(innerWidth<=640&&state.branches.every(k=>state.collapsed[k])?85:150),maxX=Math.max(...xs)+(innerWidth<=640&&state.branches.every(k=>state.collapsed[k])?85:150),minY=Math.min(...ys)-90,maxY=Math.max(...ys)+90,w=maxX-minX,h=maxY-minY,r=vp.getBoundingClientRect();state.sc=Math.max(.12,Math.min(1.05,Math.min((r.width-40)/w,(r.height-200)/h)));const cx=(minX+maxX)/2,cy=(minY+maxY)/2;state.tx=-cx*state.sc;state.ty=-cy*state.sc;applyTransform(smooth);}
let rafP=false;function redrawSoon(){if(rafP)return;rafP=true;requestAnimationFrame(()=>{rafP=false;drawWires(false);});}
function makeDraggable(el,id,onClick){
  let down=false,moved=false,sx=0,sy=0,ex=0,ey=0;
  el.addEventListener("pointercancel",()=>{down=false;el.style.cursor="";});
  if(onClick){el.tabIndex=0;el.setAttribute("role","button");el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick();}});}
  el.addEventListener("pointerdown",e=>{e.stopPropagation();down=true;moved=false;sx=e.clientX;sy=e.clientY;const p=nodePos[id];ex=p[0];ey=p[1];try{el.setPointerCapture(e.pointerId);}catch(_){}el.style.cursor="grabbing";});
  el.addEventListener("pointermove",e=>{if(!down)return;const dx=(e.clientX-sx)/state.sc,dy=(e.clientY-sy)/state.sc;if(Math.abs(dx)>3||Math.abs(dy)>3)moved=true;const nx=ex+dx,ny=ey+dy;nodePos[id]=[nx,ny];state.pos[id]=[nx,ny];el.style.left=nx+"px";el.style.top=ny+"px";redrawSoon();});
  el.addEventListener("pointerup",e=>{if(!down)return;down=false;el.style.cursor="";if(!moved&&onClick)onClick();else if(moved)persistBoard();});
}
function wirePanZoom(){
  let pinch=null;
  const measure=e=>{const a=e.touches[0],b=e.touches[1],r=vp.getBoundingClientRect();return {distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),x:(a.clientX+b.clientX)/2-r.left,y:(a.clientY+b.clientY)/2-r.top};};
  vp.addEventListener("touchstart",e=>{if(e.touches.length===2){panning=false;pinch=measure(e);}},{passive:true});
  vp.addEventListener("touchmove",e=>{if(e.touches.length!==2||!pinch)return;e.preventDefault();const next=measure(e);zoomAt(next.x,next.y,state.sc*next.distance/pinch.distance);pinch=next;},{passive:false});
  vp.addEventListener("touchend",()=>{pinch=null;panning=false;});
  let panning=false,sx=0,sy=0,ox=0,oy=0;
  vp.addEventListener("pointerdown",e=>{if(e.target.closest(".cnode")||e.target.closest(".cv-chat")||e.target.closest(".cv-zoom")||e.target.closest(".cv-top"))return;panning=true;vp.classList.add("grabbing");sx=e.clientX;sy=e.clientY;ox=state.tx;oy=state.ty;try{vp.setPointerCapture(e.pointerId);}catch(_){}});
  vp.addEventListener("pointermove",e=>{if(!panning||pinch)return;state.tx=ox+(e.clientX-sx);state.ty=oy+(e.clientY-sy);applyTransform();});
  const end=()=>{panning=false;vp.classList.remove("grabbing");};
  vp.addEventListener("pointerup",end);vp.addEventListener("pointercancel",end);
  vp.addEventListener("wheel",e=>{e.preventDefault();const c=vp.getBoundingClientRect();zoomAt(e.clientX-c.left,e.clientY-c.top,state.sc*(e.deltaY<0?1.1:1/1.1));},{passive:false});
}

/* canvas chat */
let toastT;
function toast(msg){const t=$("#toast");if(!t)return;t.innerHTML=msg;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2800);}
function handleQuery(v){
  const emp=$(".cv-empty");if(emp)emp.remove();
  if(isEverything(v)){state.branches=TOPICS.map(t=>t.key);state.branches.forEach(k=>state.collapsed[k]=true);persistBoard();renderSidebar("canvas");if(state.mapView)renderCanvasMap();else{buildWorld(true);fitContent(true);}return toast("Here's everything nearby.");}
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
  ov.innerHTML=`<div class="detail glass"><button class="x" id="dx" aria-label="Close details">${svg('<path d="M18 6 6 18M6 6l12 12"/>')}</button>
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
  if(p.coords&&typeof L!=="undefined")requestAnimationFrame(()=>{if(!$("#overlay.on #dmap"))return;const dm=L.map("dmap",{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false}).setView(p.coords,15);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(dm);L.marker(p.coords,{icon:L.divIcon({className:"",html:'<div class="pinmark"><span></span></div>',iconSize:[30,30],iconAnchor:[15,30]})}).addTo(dm);});
}
function closeDetail(){$("#overlay").classList.remove("on");}
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDetail();});

/* ================= STAGE 2: boards, context, sidebar, home ================= */
function loadBoards(){try{const b=JSON.parse(localStorage.getItem("nearby.boards")||"[]");return Array.isArray(b)?b.filter(x=>x&&typeof x.id==="string"):[];}catch(_){return[]}}
function saveBoards(b){try{localStorage.setItem("nearby.boards",JSON.stringify(b))}catch(_){}}
function upsertBoard(bd){const b=loadBoards(),i=b.findIndex(x=>x.id===bd.id);if(i>=0)b.splice(i,1);b.unshift(bd);saveBoards(b.slice(0,40));}
function deleteBoard(id){saveBoards(loadBoards().filter(x=>x.id!==id));}
function loadCtx(){try{const c=JSON.parse(localStorage.getItem("nearby.context")||"{}");return c&&typeof c==="object"&&!Array.isArray(c)?c:{};}catch(_){return{}}}
function saveCtx(c){try{localStorage.setItem("nearby.context",JSON.stringify(c))}catch(_){}}
function ago(ts){const s=(Date.now()-ts)/1000;if(s<60)return"just now";if(s<3600)return Math.floor(s/60)+"m ago";if(s<86400)return Math.floor(s/3600)+"h ago";return Math.floor(s/86400)+"d ago";}
function titleFor(){let n=(state.need||"").trim();if(!n||isEverything(n))n="Everything";n=n.charAt(0).toUpperCase()+n.slice(1);return n+" · "+(state.loc||"Detroit");}
function persistBoard(){if(!state.boardId)return;upsertBoard({id:state.boardId,title:titleFor(),loc:state.loc,need:state.need,userCoords:state.userCoords,branches:state.branches.slice(),collapsed:Object.assign({},state.collapsed),pos:Object.assign({},state.pos),ts:Date.now()});}
function openBoard(id){const bd=loadBoards().find(x=>x.id===id);if(!bd){location.hash="#/";return;}state.boardId=bd.id;state.loc=bd.loc;state.need=bd.need;state.userCoords=bd.userCoords||null;state.branches=(bd.branches||[]).filter(k=>topicByKey(k));state.collapsed=Object.assign({},bd.collapsed);state.pos=Object.assign({},bd.pos);state._init=true;state._fitted=false;state.tx=0;state.ty=0;state.sc=.9;if((location.hash||"")==="#/canvas")renderCanvas();else location.hash="#/canvas";}

function setMenu(open){
  document.body.classList.toggle("menu-open",open);
  const b=$("#mobileMenu");if(b){b.setAttribute("aria-expanded",String(open));b.textContent=open?"✕ Close":"☰ Menu";}
  const sb=$("#sidebar");sb.inert=matchMedia("(max-width: 640px)").matches&&!open;
  $(".wrap").inert=open;document.body.style.overflow=open?"hidden":"";
}
const mobileMenu=document.createElement("button");mobileMenu.id="mobileMenu";mobileMenu.className="mobile-menu";mobileMenu.setAttribute("aria-controls","sidebar");mobileMenu.setAttribute("aria-expanded","false");mobileMenu.textContent="☰ Menu";document.body.appendChild(mobileMenu);
mobileMenu.onclick=()=>setMenu(!document.body.classList.contains("menu-open"));
const menuShade=document.createElement("div");menuShade.className="menu-shade";document.body.appendChild(menuShade);menuShade.onclick=()=>setMenu(false);
document.addEventListener("keydown",e=>{if(e.key==="Escape"){setMenu(false);mobileMenu.focus();}});
window.addEventListener("resize",()=>{setMenu(false);if($("#world"))fitContent(false);});
$("#sidebar").addEventListener("click",e=>{if(!e.target.closest(".del"))setMenu(false);},true);
new MutationObserver(()=>{document.querySelectorAll(".sb-item,.sb-brand,.sb-board,.pbcard,.rcard,.qhint,.opt").forEach(el=>{if(el.hasAttribute("tabindex"))return;el.tabIndex=0;el.setAttribute("role","button");el.addEventListener("keydown",e=>{if(e.target!==el)return;if(e.key==="Enter"||e.key===" "){e.preventDefault();el.click();}});});}).observe(document.body,{childList:true,subtree:true});

function renderSidebar(active){
  const sb=$("#sidebar"),boards=loadBoards();
  sb.innerHTML=`
    <div class="sb-brand" id="sbBrand"><span class="mk">${svg(PIN)}</span>Nearby</div>
    <div class="sb-modes"><button data-m="browse" class="${(active==="new"||active==="canvas")?"":"on"}">Browse</button><button data-m="build" class="${(active==="new"||active==="canvas")?"on":""}">Build</button></div>
    <button class="sb-new" id="sbNew">${svg('<path d="M12 5v14M5 12h14"/>')} New search</button>
    <nav class="sb-nav">
      <div class="sb-item${active==="home"?" on":""}" data-v="home">${svg('<path d="M4 11 12 4l8 7M6 10v9h12v-9"/>')} Home</div>
      <div class="sb-item${active==="neighborhood"?" on":""}" data-v="neighborhood">${svg('<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-5h6v5"/>')} Neighborhood</div>
      <div class="sb-item${active==="safety"?" on":""}" data-v="safety">${svg('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>')} Safety map</div>
      <div class="sb-item${active==="resources"?" on":""}" data-v="resources">${svg('<path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M14 3v5h5"/>')} Resources</div>
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
  const feat=featuredPB();
  const list=(_pbFilter==="All"?PLAYBOOKS:PLAYBOOKS.filter(p=>p.cat===_pbFilter||(_pbFilter==="Money"&&p.cat==="Money"))).filter(p=>_pbFilter!=="All"||p.id!==feat.id);
  app.innerHTML=`<section class="screen on"><div class="home2 browse">
    <div class="eyebrow">Browse Detroit help</div>
    <h1>What do you need <em>help with?</em></h1>
    <p class="lede">Real playbooks for real situations — food, bills, housing, kids, health, money. Each one is the exact free help for that moment, in the order that works, with the official links. Pick yours.</p>
    <button class="cta" id="homeNew">${svg('<path d="M12 5v14M5 12h14"/>')} Or start your own search</button>
    <div class="whyline"><b>Not another hotline or list.</b> 211 hands you a phone number; a directory hands you a page of links. Nearby shows what's open <em>around you right now</em>, tells you plainly if you qualify, and walks the whole situation step by step — on real city data, with no login.</div>
    ${_pbFilter==="All"?pbCard(feat,true):""}
    <div class="safechips" id="pbchips" style="margin-top:24px">${PB_CATS.map(c=>`<button class="safechip${c===_pbFilter?" on":""}" data-c="${c}">${esc(c==="All"?"All playbooks":c)}</button>`).join("")}</div>
    <div class="pbgrid">${list.map(pb=>pbCard(pb,false)).join("")}</div>
    <div class="insights">
      <div class="sb-label" style="padding-left:0">Detroit right now</div>
      <div class="insightgrid">
        <div class="istat glass"><div class="iv">${PLACES.length}</div><div class="il">verified places</div></div>
        <div class="istat glass"><div class="iv">${openNow}</div><div class="il">open right now</div></div>
        <div class="istat glass"><div class="iv">${RESOURCES.length}</div><div class="il">help programs</div></div>
      </div>
      <div class="catrow">${TOPICS.map(t=>`<span class="catpill">${svg(t.icon)} ${t.name} · ${PLACES.filter(p=>p.layer.includes(t.key)).length}</span>`).join("")}</div>
    </div>
    ${boards.length?`<div class="recent"><div class="sb-label">Recent searches</div><div class="recentgrid">${boards.slice(0,6).map(b=>`<div class="rcard glass" data-id="${b.id}"><div class="rn">${esc(b.title)}</div><div class="rd">${ago(b.ts)}</div></div>`).join("")}</div></div>`:""}
  </div></section>`;
  app.querySelectorAll(".pbcard").forEach(el=>el.onclick=()=>{location.hash="#/play/"+el.dataset.pb;});
  app.querySelectorAll("#pbchips .safechip").forEach(b=>b.onclick=()=>{_pbFilter=b.dataset.c;renderHome();});
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
    <div class="saverow"><button class="save" id="ctxSave">Save Context</button><span class="saved" id="ctxSaved">Saved</span></div>
  </div></section>`;
  app.querySelectorAll(".opt").forEach(el=>el.onclick=()=>{const k=el.dataset.key,v=el.dataset.val,multi=el.dataset.multi==="1",cur=loadCtx();if(multi){cur[k]=cur[k]||[];const i=cur[k].indexOf(v);if(i>=0)cur[k].splice(i,1);else cur[k].push(v);}else{cur[k]=cur[k]===v?"":v;el.parentNode.querySelectorAll(".opt").forEach(o=>{if(o!==el)o.classList.remove("on");});}saveCtx(cur);el.classList.toggle("on");});
  $("#ctxSave").onclick=()=>{const cur=loadCtx();cur.neighborhood=$("#ctxN").value.trim();saveCtx(cur);const s=$("#ctxSaved");s.classList.add("on");setTimeout(()=>s.classList.remove("on"),1600);};
}

/* ---- real Detroit crime feed (DPD RMS Incidents, current 2026 data) ---- */
const CRIME_LAYER="https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services/RMS_Crime_Incidents_2026/FeatureServer/0/query";
const CRIME_FIELDS="offense_category,offense_description,incident_occurred_at,neighborhood,nearest_intersection,latitude,longitude";
let _crime=null;
function fetchCrime(){
  if(_crime)return Promise.resolve(_crime);
  const d=new Date(Date.now()-21*864e5),pad=n=>(n<10?"0":"")+n;
  const since=d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" 00:00:00";
  const where="incident_occurred_at >= TIMESTAMP '"+since+"' AND latitude IS NOT NULL";
  const out=[];
  function page(off){
    const u=CRIME_LAYER+"?where="+encodeURIComponent(where)+"&outFields="+encodeURIComponent(CRIME_FIELDS)+"&orderByFields="+encodeURIComponent("incident_occurred_at DESC")+"&resultRecordCount=2000&resultOffset="+off+"&f=json&returnGeometry=false";
    return fetch(u,{signal:AbortSignal.timeout(10000)}).then(r=>r.json()).then(j=>{
      if(!j.features)throw 0;
      j.features.forEach(f=>{const a=f.attributes;if(a.latitude&&a.longitude)out.push({
        lat:+a.latitude,lng:+a.longitude,cat:(a.offense_category||"Other").trim(),
        desc:(a.offense_description||"").trim(),ts:a.incident_occurred_at,
        hood:(a.neighborhood||"").trim(),addr:(a.nearest_intersection||"").trim()});});
      if(j.exceededTransferLimit&&out.length<8000)return page(off+2000);
      return out;
    });
  }
  return page(0).then(r=>{_crime=r;return r;}).catch(()=>null);
}
function crimeGradient(){return {0.2:"#3b82c4",0.45:"#7c5cbf",0.7:"#b53d8e",1:"#c02d55"};}
let _safetymap=null;
function removeSafetyMap(){if(!_safetymap)return;_safetymap.eachLayer(layer=>{if(layer._frame){L.Util.cancelAnimFrame(layer._frame);layer._frame=null;}});_safetymap.remove();_safetymap=null;}

function renderSafety(){
  app.innerHTML=`<section class="screen on"><div class="safety">
    <div class="eyebrow">${svg('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>')} Neighborhood safety</div>
    <h1>Where incidents were <em>reported</em>.</h1>
    <p class="lede">The most recent incident reports from the Detroit Police Department. This map shows where things were <strong>reported</strong> — not how safe any block is. Busier areas with more people and businesses naturally report more.</p>
    <div class="safebar" id="safebar"><div class="sload">${svg('<circle cx="12" cy="12" r="9"/>')} Loading real DPD reports…</div></div>
    <div class="safechips" id="safechips"></div>
    <div class="mapwrap"><div class="safetymap" id="safetymap"></div><div class="maplegend"><span>Fewer reports</span><i class="legbar"></i><span>More</span></div></div>
    <p class="attrib">Source: City of Detroit Open Data — DPD RMS Crime Incidents (2026). Live feed, updated by the city continuously.</p>
  </div></section>`;
  fetchCrime().then(rows=>{
    const bar=$("#safebar");if(!bar)return;
    if(!rows||!rows.length||typeof L==="undefined"||!L.heatLayer){bar.innerHTML=`<div class="sload err">Couldn't reach the live Detroit crime feed right now. Try again in a moment.</div>`;return;}
    const cats={};rows.forEach(r=>cats[r.cat]=(cats[r.cat]||0)+1);
    const top=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
    const dates=rows.map(r=>r.ts).filter(Boolean),lo=new Date(Math.min(...dates)),hi=new Date(Math.max(...dates));
    const fmt=d=>d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
    bar.innerHTML=`<div class="sstat"><b>${rows.length.toLocaleString()}</b><span>reports shown</span></div>
      <div class="sstat"><b>${top.length}</b><span>categories</span></div>
      <div class="sstat"><b>${fmt(lo)} – ${fmt(hi)}</b><span>date range</span></div>`;
    const state2={active:"All"};
    const chipEl=$("#safechips");
    const chips=[["All",rows.length]].concat(top.slice(0,8));
    chipEl.innerHTML=chips.map(([c,n])=>`<button class="safechip${c==="All"?" on":""}" data-c="${esc(c)}">${esc(c==="All"?"All reports":c[0]+c.slice(1).toLowerCase())} <em>${n}</em></button>`).join("");
    function draw(){
      const list=state2.active==="All"?rows:rows.filter(r=>r.cat===state2.active);
      removeSafetyMap();
      _safetymap=L.map("safetymap",{zoomControl:true,attributionControl:true,scrollWheelZoom:false}).setView([42.3568,-83.0900],11.3);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(_safetymap);
      const pts=list.map(r=>[r.lat,r.lng,0.6]);
      const heat=L.heatLayer([],{radius:24,blur:20,maxZoom:15,minOpacity:.35,gradient:crimeGradient()}).addTo(_safetymap);
      // animated "bloom": reveal points in batches
      const heatMap=_safetymap;let i=0;const step=Math.max(30,Math.ceil(pts.length/28));
      (function bloom(){if(!document.contains(chipEl)||_safetymap!==heatMap)return;i=Math.min(pts.length,i+step);heat.setLatLngs(pts.slice(0,i));if(i<pts.length)requestAnimationFrame(bloom);})();
    }
    chipEl.querySelectorAll(".safechip").forEach(b=>b.onclick=()=>{chipEl.querySelectorAll(".safechip").forEach(x=>x.classList.remove("on"));b.classList.add("on");state2.active=b.dataset.c;draw();});
    draw();
  });
}

function renderNeighborhood(){
  const openNow=PLACES.filter(p=>computeStatus(p)==="open").length;
  app.innerHTML=`<section class="screen on"><div class="hood">
    <div class="eyebrow">${svg(SPARK)} Neighborhood pulse</div>
    <h1>What's happening <em>around you</em>.</h1>
    <p class="lede">A live read of your area from real Detroit open data — no rumors, no made-up numbers. Just what the city's own feeds are showing this week.</p>
    <div class="pulsegrid" id="pulsegrid">
      <div class="pcard glass wide"><div class="pk">Loading live signals…</div></div>
    </div>
    <p class="attrib">Signals from City of Detroit Open Data (DPD incident reports) + Nearby's verified resource list. Trends are counted from real reports, not estimated.</p>
  </div></section>`;
  fetchCrime().then(rows=>{
    const g=$("#pulsegrid");if(!g)return;
    const resourceCards=`
      <div class="pcard glass"><div class="pk">Open right now</div><div class="pv">${openNow}<span>of ${PLACES.length} places</span></div><div class="psub">Food, bills, housing, jobs and health spots accepting people at this hour.</div></div>`;
    if(!rows){g.innerHTML=resourceCards+`<div class="pcard glass wide"><div class="pk">Live city feed</div><div class="psub">Couldn't reach the Detroit open-data feed right now — the resource counts above are still live. Try again shortly.</div></div>`;return;}
    const now=Date.now(),wk=7*864e5;
    const last7=rows.filter(r=>r.ts&&now-r.ts<wk),prev7=rows.filter(r=>r.ts&&now-r.ts>=wk&&now-r.ts<2*wk);
    const diff=prev7.length?Math.round((last7.length-prev7.length)/prev7.length*100):0;
    const cats={};last7.forEach(r=>cats[r.cat]=(cats[r.cat]||0)+1);
    const topCats=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const hoods={};last7.forEach(r=>{if(r.hood)hoods[r.hood]=(hoods[r.hood]||0)+1;});
    const topHoods=Object.entries(hoods).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],dc=[0,0,0,0,0,0,0];
    last7.forEach(r=>{if(r.ts)dc[new Date(r.ts).getDay()]++;});
    const maxd=Math.max(1,...dc);
    const recent=rows.slice(0,6);
    const cap=s=>s?s[0]+s.slice(1).toLowerCase():s;
    g.innerHTML=`
      ${resourceCards}
      <div class="pcard glass"><div class="pk">Reports this week</div><div class="pv">${last7.length}<span class="${diff<=0?'down':'up'}">${diff>0?"▲ "+diff+"%":diff<0?"▼ "+Math.abs(diff)+"%":"—"} vs last week</span></div><div class="psub">Incident reports citywide in the last 7 days, from Detroit Police open data.</div></div>
      <div class="pcard glass"><div class="pk">Most reported this week</div><div class="barlist">${topCats.map(([c,n])=>`<div class="brow"><span class="bl">${esc(cap(c))}</span><i class="bfill" style="width:${Math.round(n/topCats[0][1]*100)}%"></i><span class="bn">${n}</span></div>`).join("")}</div></div>
      <div class="pcard glass"><div class="pk">When it happens</div><div class="daybars">${dc.map((n,i)=>`<div class="daycol"><i style="height:${Math.round(n/maxd*100)}%"></i><span>${days[i][0]}</span></div>`).join("")}</div><div class="psub">Reports by day of week, last 7 days.</div></div>
      ${topHoods.length?`<div class="pcard glass"><div class="pk">Most active areas</div><div class="chiprow">${topHoods.map(([h,n])=>`<span class="hchip">${esc(h)} <em>${n}</em></span>`).join("")}</div><div class="psub">Neighborhoods with the most reports this week. More people and traffic usually means more reports.</div></div>`:""}
      <div class="pcard glass wide"><div class="pk">Latest reports</div><div class="feed">${recent.map(r=>`<div class="fitem"><span class="fdot"></span><div><div class="ft">${esc(cap(r.cat))}${r.desc?" · "+esc(r.desc.toLowerCase()):""}</div><div class="fm">${r.addr?esc(r.addr):"Detroit"}${r.hood?" · "+esc(r.hood):""} · ${r.ts?ago(r.ts):""}</div></div></div>`).join("")}</div><a class="hoodlink" href="#/safety">See the full safety map →</a></div>`;
  });
}

/* Native in-app help directory — real Michigan/Detroit assistance programs,
   written in plain English, each with its OFFICIAL application link. */
let RESOURCES=[
  {cat:"Food",name:"SNAP food assistance (EBT)",save:"Up to ~$290/mo for 1 person",what:"Monthly money on an EBT card to buy groceries. Most working families with low or moderate income qualify.",who:"Based on household size and income. A single person under about $1,600/mo usually qualifies; more people, higher limit.",how:"Apply free online through Michigan's MI Bridges — takes about 20 minutes.",link:"https://newmibridges.michigan.gov",label:"Apply on MI Bridges"},
  {cat:"Food",name:"Double Up Food Bucks",save:"Doubles your produce money",what:"When you spend SNAP dollars on fruits and vegetables at participating Detroit stores and markets, they match it — spend $10, get $10 more for produce.",who:"Anyone with a SNAP/EBT card. No separate sign-up at most markets.",how:"Just shop with your EBT card at a participating store or farmers market.",link:"https://www.doubleupfoodbucks.org/where-to-use",label:"Find a store or market"},
  {cat:"Food",name:"WIC (moms & young kids)",save:"Free food + formula",what:"Free healthy food, baby formula, and nutrition help for pregnant women and kids under 5.",who:"Pregnant, new moms, or families with children under 5, at or below a moderate income (many working families qualify).",how:"Call your local Detroit WIC clinic to set up an appointment.",link:"https://www.michigan.gov/mdhhs/assistance-programs/wic",label:"Michigan WIC info"},
  {cat:"Food",name:"Free food pantries",save:"Free groceries this week",what:"Gleaners and Forgotten Harvest run free food distributions across Detroit — no cost, most are walk-in.",who:"Anyone who needs food. Usually no ID or paperwork required.",how:"Look up the nearest pantry and its hours.",link:"https://www.gcfb.org/get-help/",label:"Find a pantry near you"},
  {cat:"Bills",name:"Utility & heat shut-off help (SER)",save:"Keeps the lights & heat on",what:"State Emergency Relief helps pay overdue electric, gas, or heating bills so you don't get shut off.",who:"Households facing a shut-off or past-due bill with limited income.",how:"Apply free through MI Bridges (same login as food help).",link:"https://newmibridges.michigan.gov",label:"Apply on MI Bridges"},
  {cat:"Bills",name:"DTE payment help",save:"Lower, steady monthly bill",what:"DTE's Low-Income Self-Sufficiency Plan sets a fixed affordable monthly payment and can wipe out past-due balances over time.",who:"DTE customers with low income or who get SNAP/Medicaid.",how:"Call DTE or apply through a local agency.",link:"https://www.dteenergy.com/us/en/residential/billing-and-payments/payment-assistance.html",label:"DTE payment assistance"},
  {cat:"Bills",name:"Cheaper phone & internet",save:"Discount on monthly service",what:"The Lifeline program lowers your phone or internet bill each month.",who:"Households on SNAP, Medicaid, or with low income.",how:"Check if you qualify and pick a provider.",link:"https://www.lifelinesupport.org/",label:"Check Lifeline eligibility"},
  {cat:"Housing",name:"Rent & eviction help",save:"Stay in your home",what:"United Community Housing Coalition helps Detroiters facing eviction with rent money, legal help, and negotiating with landlords.",who:"Detroit renters behind on rent or facing eviction.",how:"Call UCHC or start online.",link:"https://www.uchcdetroit.org/",label:"Get housing help"},
  {cat:"Housing",name:"Section 8 housing voucher",save:"Pay ~30% of income for rent",what:"A voucher that covers part of your rent so you pay only a share of your income.",who:"Low-income households. Waitlists open at certain times — get on the list when it does.",how:"Apply through the Detroit Housing Commission.",link:"https://www.dhcmi.org/",label:"Detroit Housing Commission"},
  {cat:"Housing",name:"Dial 211 for anything",save:"Free, 24/7, real person",what:"Michigan 211 connects you to food, rent, utilities, and any local help — a free call with a real person who knows Detroit resources.",who:"Anyone. Free and confidential.",how:"Dial 2-1-1 or search online.",link:"https://mi211.org/",label:"Search 211 or dial 211"},
  {cat:"Health",name:"Medicaid / Healthy Michigan",save:"$0–low-cost health coverage",what:"Free or very low-cost health insurance covering doctors, hospital, prescriptions, and mental health.",who:"Adults and kids with low or moderate income. Many working people qualify.",how:"Apply free through MI Bridges.",link:"https://newmibridges.michigan.gov",label:"Apply on MI Bridges"},
  {cat:"Family",name:"Childcare subsidy (CDC)",save:"Most of your childcare paid",what:"Michigan's Child Development & Care program pays most of your childcare cost while you work or go to school.",who:"Working or in-school parents with low or moderate income.",how:"Apply free through MI Bridges.",link:"https://newmibridges.michigan.gov",label:"Apply on MI Bridges"},
  {cat:"Family",name:"Head Start (free preschool)",save:"Free early learning + meals",what:"Free preschool, meals, and family support for young children in Detroit.",who:"Families with kids ages 0–5, income-based.",how:"Find a Detroit Head Start program near you.",link:"https://www.michigan.gov/mikidsmatter",label:"Find Head Start"},
  {cat:"Money",name:"Free tax prep (VITA)",save:"Keep your whole refund",what:"Trained volunteers file your taxes for free and make sure you get every credit — no fees taken from your refund.",who:"Households earning roughly under $67,000/yr.",how:"Book with Accounting Aid Society in Detroit.",link:"https://www.accountingaidsociety.org/",label:"Book free tax help"},
  {cat:"Money",name:"Free credit & debt counseling",save:"A real plan to pay off debt",what:"GreenPath (a Michigan nonprofit) gives free, judgment-free help with debt, credit, and budgeting.",who:"Anyone. Free confidential sessions by phone or online.",how:"Start a free session with GreenPath.",link:"https://www.greenpath.org/",label:"Talk to GreenPath free"}
];
const RES_CATS=[["All","All help"],["Food","Food"],["Bills","Bills & utilities"],["Housing","Housing"],["Health","Health"],["Family","Family & kids"],["Money","Money & taxes"]];
let _resFilter="All";
function renderResources(){
  const list=_resFilter==="All"?RESOURCES:RESOURCES.filter(r=>r.cat===_resFilter);
  app.innerHTML=`<section class="screen on"><div class="res">
    <div class="eyebrow">${svg('<path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>')} Money & benefits</div>
    <h1>Real help you can <em>actually get</em>.</h1>
    <p class="lede">Free programs for Detroit residents — food, bills, housing, health, kids and taxes. Plain English on who qualifies and how to apply, with a link straight to the <strong>official</strong> application. Nearby never asks for your personal info.</p>
    <div class="safechips" id="reschips">${RES_CATS.map(([k,l])=>`<button class="safechip${k===_resFilter?" on":""}" data-c="${k}">${esc(l)}</button>`).join("")}</div>
    <div class="resgrid">${list.map((r,idx)=>`<div class="rescard glass" data-i="${idx}">
      <span class="rtag">${esc(RES_CATS.find(c=>c[0]===r.cat)[1])}</span>
      <div class="rct">${esc(r.name)}</div>
      <div class="rsave">${svg('<path d="M20 6 9 17l-5-5"/>')} ${esc(r.save)}</div>
      <div class="rcd">${esc(r.what)}</div>
      <div class="rmore">
        <div class="rrow"><b>Who qualifies</b><span>${esc(r.who)}</span></div>
        <div class="rrow"><b>How to get it</b><span>${esc(r.how)}</span></div>
      </div>
      <div class="ract"><button class="rexp">Details ${svg('<path d="M6 9l6 6 6-6"/>')}</button><a class="rgo" href="${r.link}" target="_blank" rel="noopener">${esc(r.label)} ${svg(ARROW)}</a></div>
    </div>`).join("")}</div>
    <p class="attrib">Program details compiled by Nearby from official Michigan (MI Bridges / MDHHS) and Detroit nonprofit sources, in our own words. Always confirm current eligibility on the official site.</p>
  </div></section>`;
  app.querySelectorAll("#reschips .safechip").forEach(b=>b.onclick=()=>{_resFilter=b.dataset.c;renderResources();});
  app.querySelectorAll(".rexp").forEach(b=>b.onclick=()=>{const c=b.closest(".rescard");c.classList.toggle("open");});
}

/* ---- Browse hub: real-life "playbooks" (IdeaBrowser-style), wired to our programs ---- */
let PLAYBOOKS=[
  {id:"food-out",cat:"Food",title:"Food money ran out this week",hook:"Get groceries in your hands today, then more money on your EBT card.",value:"Up to ~$290/mo + free groceries",effort:"Low · ~20 min",who:"Anyone low on food right now",res:["Free food pantries","SNAP food assistance (EBT)","Double Up Food Bucks"],q:"food"},
  {id:"dte",cat:"Bills",title:"Behind on your DTE or heat bill",hook:"Stop a shut-off and lock in a monthly payment you can actually afford.",value:"Bill help + lower fixed plan",effort:"Low · one call or form",who:"DTE customers behind on a bill",res:["Utility & heat shut-off help (SER)","DTE payment help","Cheaper phone & internet"],q:"help with bills"},
  {id:"eviction",cat:"Housing",title:"Facing eviction or behind on rent",hook:"Get rent money and someone in your corner before it reaches court.",value:"Rent help + free legal aid",effort:"Medium · act today",who:"Renters behind on rent",res:["Rent & eviction help","Utility & heat shut-off help (SER)","Dial 211 for anything"],q:"housing help"},
  {id:"baby",cat:"Family",title:"Expecting or just had a baby",hook:"Free food and formula, $0 health coverage, and help paying for childcare.",value:"Free food + coverage + childcare",effort:"Low–Medium",who:"Pregnant or new parents",res:["WIC (moms & young kids)","Medicaid / Healthy Michigan","Childcare subsidy (CDC)"],q:"kids"},
  {id:"job",cat:"Money",title:"Just lost your job",hook:"Bridge the gap: food, health coverage, and one call for everything else.",value:"Food + coverage + local help",effort:"Low · ~20 min",who:"Anyone between jobs",res:["SNAP food assistance (EBT)","Medicaid / Healthy Michigan","Dial 211 for anything"],q:"jobs"},
  {id:"health",cat:"Health",title:"No health insurance",hook:"Get covered for $0 to low cost — often within the same week.",value:"$0–low-cost coverage",effort:"Low · ~20 min",who:"Uninsured adults & kids",res:["Medicaid / Healthy Michigan","Dial 211 for anything"],q:"health"},
  {id:"tax",cat:"Money",title:"Get your full tax refund",hook:"File free and claim every credit — keep all of it, no fees.",value:"Credits often worth $2,000+",effort:"Low · book a slot",who:"Earners under ~$67k",res:["Free tax prep (VITA)","Free credit & debt counseling"],q:"benefits"},
  {id:"new",cat:"All",title:"New here and need everything",hook:"One map, one call — food, housing, and health, all around you.",value:"Everything in one place",effort:"Low",who:"Anyone getting started",res:["Dial 211 for anything","SNAP food assistance (EBT)","Medicaid / Healthy Michigan"],q:"everything"}
];
const PB_CATS=["All","Food","Bills","Housing","Family","Health","Money"];
let _pbFilter="All";
function featuredPB(){return PLAYBOOKS[new Date().getDate()%PLAYBOOKS.length];}
function pbCard(pb,feat){return `<div class="pbcard glass${feat?" feat":""}" data-pb="${pb.id}">
  <div class="pbtop"><span class="rtag">${esc(pb.cat==="All"?"Getting started":pb.cat)}</span>${feat?`<span class="pbday">${svg(SPARK)} Today's playbook</span>`:""}</div>
  <div class="pbt">${esc(pb.title)}</div>
  <div class="pbhook">${esc(pb.hook)}</div>
  <div class="pbstats">
    <div class="pbstat"><span>You could get</span><b>${esc(pb.value)}</b></div>
    <div class="pbstat"><span>Effort</span><b>${esc(pb.effort)}</b></div>
    <div class="pbstat"><span>Programs</span><b>${pb.res.length}</b></div>
  </div>
  <span class="pbgo">See the plan ${svg(ARROW)}</span></div>`;}

function renderResCard(name){
  const r=RESOURCES.find(x=>x.name===name);if(!r)return "";
  return `<div class="rescard glass open" style="animation:none">
    <span class="rtag">${esc(RES_CATS.find(c=>c[0]===r.cat)[1])}</span>
    <div class="rct">${esc(r.name)}</div>
    <div class="rsave">${svg('<path d="M20 6 9 17l-5-5"/>')} ${esc(r.save)}</div>
    <div class="rcd">${esc(r.what)}</div>
    <div class="rmore"><div class="rrow"><b>Who qualifies</b><span>${esc(r.who)}</span></div><div class="rrow"><b>How to get it</b><span>${esc(r.how)}</span></div></div>
    <div class="ract"><a class="rgo" href="${r.link}" target="_blank" rel="noopener">${esc(r.label)} ${svg(ARROW)}</a></div></div>`;
}
function renderPlaybook(id){
  const pb=PLAYBOOKS.find(p=>p.id===id);if(!pb){location.hash="#/";return;}
  app.innerHTML=`<section class="screen on"><div class="res">
    <a class="backlink" id="pbBack">${svg('<path d="M15 18l-6-6 6-6"/>')} All playbooks</a>
    <div class="eyebrow" style="margin-top:14px">${svg(SPARK)} ${esc(pb.cat==="All"?"Getting started":pb.cat)} playbook</div>
    <h1>${esc(pb.title)}</h1>
    <p class="lede">${esc(pb.hook)}</p>
    <div class="scorecard">
      <div class="score glass"><span>You could get</span><b>${esc(pb.value)}</b></div>
      <div class="score glass"><span>Effort</span><b>${esc(pb.effort)}</b></div>
      <div class="score glass"><span>Who it's for</span><b>${esc(pb.who)}</b></div>
    </div>
    <div class="planhead">Your plan · ${pb.res.length} steps</div>
    <div class="resgrid">${pb.res.map((n,i)=>`<div class="planstep"><span class="pnum">${i+1}</span>${renderResCard(n)}</div>`).join("")}</div>
    <button class="cta" id="pbSearch" style="margin-top:26px">${svg(PIN)} See ${esc(pb.cat==="All"?"help":pb.cat.toLowerCase())} places near me</button>
    <div class="usebar" id="useBar"><span class="ut">Would this help a Detroiter you know?</span><button class="useyes" id="useYes">${svg('<path d="M7 11v9M2 13v6a2 2 0 0 0 2 2h11.5a2 2 0 0 0 2-1.6l1.4-7A1.5 1.5 0 0 0 18.4 11H13l1-4.2A2 2 0 0 0 12 4l-5 7Z"/>')} I'd use this</button></div>
    <p class="attrib">A Nearby playbook — the real programs for this situation, in the order that helps most. Details from official Michigan &amp; Detroit sources; confirm current eligibility on each site.</p>
  </div></section>`;
  $("#pbBack").onclick=()=>{location.hash="#/";};
  $("#pbSearch").onclick=()=>{state.boardId=null;state._init=false;state._pendNeed=pb.q;location.hash="#/new";};
  $("#useYes").onclick=async()=>{const button=$("#useYes");button.disabled=true;const ok=await sbInsert("feedback",{kind:"would_use",ref:pb.id});if(!document.contains(button))return;if(!ok){button.disabled=false;button.textContent="Could not send — retry";return;}const b=$("#useBar");b.classList.add("done");b.innerHTML='<span class="ut">'+svg('<path d="M20 6 9 17l-5-5"/>')+' Thank you — that\'s a real signal we can show the city.</span>';};
}

/* ---- router ---- */
function route(){
  setMenu(false);closeDetail();if(_cvmap){_cvmap.remove();_cvmap=null;}removeSafetyMap();
  const h=location.hash||"#/";
  let active="home";
  if(h==="#/context")active="context";else if(h==="#/safety")active="safety";else if(h==="#/neighborhood")active="neighborhood";else if(h==="#/resources")active="resources";else if(h==="#/canvas"||h.indexOf("#/board/")===0)active="canvas";else if(h==="#/new")active="new";
  renderSidebar(active);
  if(h.indexOf("#/play/")===0){renderPlaybook(h.slice(7));return;}
  if(h.indexOf("#/board/")===0){openBoard(h.slice(8));return;}
  if(h==="#/new"){renderIntro();return;}
  if(h==="#/canvas"&&state.loc){state._fitted=false;renderCanvas();return;}
  if(h==="#/context"){renderContext();return;}
  if(h==="#/safety"){renderSafety();return;}
  if(h==="#/neighborhood"){renderNeighborhood();return;}
  if(h==="#/resources"){renderResources();return;}
  renderHome();
}
window.addEventListener("hashchange",route);
if(!$("#overlay")){const o=document.createElement("div");o.className="overlay";o.id="overlay";document.body.appendChild(o);}
function sbGet(path){return fetch(window.SUPABASE_URL.replace(/\/$/,"")+"/rest/v1/"+path,{headers:{apikey:window.SUPABASE_ANON_KEY,Authorization:"Bearer "+window.SUPABASE_ANON_KEY},signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null);}
function sbInsert(table,obj){if(!window.SUPABASE_URL)return Promise.resolve(false);return fetch(window.SUPABASE_URL.replace(/\/$/,"")+"/rest/v1/"+table,{method:"POST",headers:{apikey:window.SUPABASE_ANON_KEY,Authorization:"Bearer "+window.SUPABASE_ANON_KEY,"Content-Type":"application/json"},body:JSON.stringify(obj)}).then(r=>r.ok).catch(()=>false);}
async function boot(){
  route();maybeOnboard();
  if(window.SUPABASE_URL&&window.SUPABASE_ANON_KEY){
    try{
      const rows=await sbGet("places?select=*");
      if(rows&&rows.length){window.PLACES=rows.map(x=>({id:x.id,name:x.name,layer:x.layer,category:x.category,address:x.address,neighborhood:x.neighborhood,hours:x.hours,phone:x.phone,note:x.note,bring:x.bring,coords:(x.lat!=null&&x.lng!=null)?[x.lat,x.lng]:null}));}
    }catch(_){/* fall back to built-in data */}
    try{
      const rs=await sbGet("resources?select=*&order=sort.asc");
      if(rs&&rs.length){RESOURCES=rs.map(x=>({cat:x.cat,name:x.name,save:x.save,what:x.what,who:x.who,how:x.how,link:x.link,label:x.label}));}
    }catch(_){/* fall back to built-in resources */}
  }
  if(!location.hash||location.hash==="#/"||location.hash==="#/home")renderHome();
}
boot();

/* ---- first-run onboarding (shows once per browser) ---- */
function maybeOnboard(){
  try{if(localStorage.getItem("nearby.onboarded"))return;}catch(_){return;}
  const ov=document.createElement("div");
  ov.className="onb"; ov.id="onb";
  ov.innerHTML=`<div class="onbcard">
    <div class="onbmk"><span class="mk">${svg(PIN)}</span></div>
    <div class="onbeye">Welcome to Nearby · demo</div>
    <h2>Just say what you need.</h2>
    <p>Tell Nearby <b>where you are</b> and <b>what you need</b> — in plain words. It maps the real, free help around you, all connected to you.</p>
    <div class="onbex"><span class="onbq">Try typing something like</span><div class="onbprompt">${svg('<path d="m3 11 19-9-9 19-2-8-8-2Z"/>')} “I'm near 7 Mile &amp; Gratiot and I need food today”</div></div>
    <div class="onbrow">
      <button class="onbgo" id="onbGo">Try it now ${svg(ARROW)}</button>
      <button class="onbskip" id="onbSkip">Look around first</button>
    </div>
    <div class="onbfoot">Free · no login · Detroit</div>
  </div>`;
  document.body.appendChild(ov);
  const done=()=>{try{localStorage.setItem("nearby.onboarded","1");}catch(_){ } ov.classList.add("out");setTimeout(()=>ov.remove(),320);};
  requestAnimationFrame(()=>ov.classList.add("show"));
  ov.addEventListener("click",e=>{if(e.target===ov)done();});
  $("#onbSkip",ov).onclick=done;
  $("#onbGo",ov).onclick=()=>{done();state.boardId=null;state._init=false;location.hash="#/new";};
}
})();
