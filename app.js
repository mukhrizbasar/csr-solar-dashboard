import { CONFIG } from "./config.js";
const FB="https://www.gstatic.com/firebasejs/10.12.2/";
let initializeApp, getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, getDoc, getDocs, updateDoc;

const STATUSES = ["Site Visit","Pending Proposal","Pending Approval Memo","Approved","Ongoing","Completed"];
const SVAR = {"Site Visit":"--s-visit","Pending Proposal":"--s-proposal","Pending Approval Memo":"--s-memo","Approved":"--s-approved","Ongoing":"--s-ongoing","Completed":"--s-done"};
const TYPES = ["Solar Rooftop","Solar Streetlight","Rooftop + Streetlight","Other"];
const TCLS = {"Solar Rooftop":"t-rooftop","Solar Streetlight":"t-street","Rooftop + Streetlight":"t-both","Other":"t-other"};
const STATES = ["Johor","Kedah","Kelantan","Malacca","Negeri Sembilan","Pahang","Perak","Perlis","Penang","Sabah","Sarawak","Selangor","Terengganu","W.P. Kuala Lumpur","W.P. Labuan","W.P. Putrajaya","Nationwide"];
const COMPONENTS = ["Komuniti Lestari","Tree for a Tree","Pulau Tenaga Hijau","Biodiversity","Firefly Conservation","Extinction Species"];
const YEARS = [2025,2026,2027,2028,2029,2030];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const PEN=[[1.2,99.6],[6.8,104.6]], ALL=[[0.8,99.6],[7.4,119.3]];

const S = { projects:new Map(), year:String(Math.min(2030,Math.max(2025,new Date().getFullYear()))), type:"solar", status:"", state:"", comp:"", q:"", sel:null, editing:null, confirmDel:false, pick:false, canWrite:false, user:null, loaded:false };
const PH={ for:null, unsub:null, list:[], loading:false, open:null, busy:0 };
try{ const t=localStorage.getItem("csr-type"); if(t) S.type=t; const y=localStorage.getItem("csr-year"); if(y!==null) S.year=y; }catch(e){}
const projYear = p => p.year ? +p.year : (p.appDate ? +String(p.appDate).slice(0,4) : null);

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rm = v => v==null||v==="" ? "—" : "RM " + Number(v).toLocaleString("en-MY",{maximumFractionDigits:0});
const rmShort = v => { v=+v||0; return v>=1e6 ? "RM "+(v/1e6).toFixed(2)+"M" : v>=1e3 ? "RM "+Math.round(v/1e3)+"k" : "RM "+v; };
const fmtDate = d => { if(!d) return "—"; const x=new Date(d+"T00:00:00"); return isNaN(x)?d:x.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}); };
const sc = s => `var(${SVAR[s]||"--muted"})`;
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const scHex = s => css(SVAR[s]||"--muted");
const isSolar = p => p.type && p.type!=="Other";
function toast(m){ const t=$("toast"); t.textContent=m; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2800); }
function gmaps(p){ return p.lat!=null ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+", "+(p.state||"")+", Malaysia")}`; }
function typeMatch(p){ if(S.type==="solar") return isSolar(p); if(S.type==="Solar Rooftop") return p.type==="Solar Rooftop"||p.type==="Rooftop + Streetlight"; if(S.type==="Solar Streetlight") return p.type==="Solar Streetlight"||p.type==="Rooftop + Streetlight"; return true; }
function filtered(ignoreStatus){
  const q=S.q.trim().toLowerCase();
  return [...S.projects.values()].filter(p=>{
    if(!typeMatch(p)) return false;
    if(S.year && projYear(p)!==+S.year) return false;
    if(S.state && p.state!==S.state) return false;
    if(S.comp && p.component!==S.comp) return false;
    if(!ignoreStatus && S.status && p.status!==S.status) return false;
    if(q && !(`${p.name} ${p.remarks||""} ${p.state||""}`.toLowerCase().includes(q))) return false;
    return true;
  }).sort((a,b)=>(a.no||999)-(b.no||999));
}

/* ================= MAP (Google Maps, or Leaflet + OpenStreetMap fallback) ================= */
const M = { markers:new Map(), pickMarker:null, clickCb:null };
function shapePath(type){
  if(type==="Solar Streetlight") return "M 0,-9 9,0 0,9 -9,0 z";
  if(type==="Rooftop + Streetlight") return "M -8,0 A 8 8 0 1 1 0,8 L -8,8 z";
  if(type==="Other") return "M -5,0 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0";
  return "M -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0";
}
async function initMap(){
  if(CONFIG.googleMapsKey){
    try{ await loadGoogle(CONFIG.googleMapsKey); return initGoogle(); }
    catch(e){ console.warn("Google Maps failed, using OpenStreetMap", e); toast("Google Maps couldn’t load. Showing the free map instead."); }
  }
  initLeaflet();
}
function loadGoogle(key){
  return new Promise((res,rej)=>{
    window.__gmReady=res; window.gm_authFailure=()=>rej(new Error("Maps key rejected"));
    const s=document.createElement("script");
    s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__gmReady&v=weekly&loading=async`;
    s.async=true; s.onerror=rej; document.head.appendChild(s);
    setTimeout(()=>rej(new Error("timeout")),15000);
  });
}
function initGoogle(){
  const g=google.maps;
  const map=new g.Map($("map"),{ mapTypeId:"roadmap", mapTypeControl:true, mapTypeControlOptions:{mapTypeIds:["roadmap","hybrid"]}, streetViewControl:true, fullscreenControl:true, clickableIcons:false, gestureHandling:"greedy" });
  const toB=b=>new g.LatLngBounds({lat:b[0][0],lng:b[0][1]},{lat:b[1][0],lng:b[1][1]});
  map.fitBounds(toB(PEN));
  map.addListener("click",e=>M.clickCb&&M.clickCb(e.latLng.lat(),e.latLng.lng()));
  const info=new g.InfoWindow();
  Object.assign(M,{
    kind:"google",
    fit:b=>map.fitBounds(toB(b)),
    flyTo:(lat,lng,z)=>{ map.panTo({lat,lng}); if(map.getZoom()<z) map.setZoom(z); },
    upsert(id,p,sel,onClick){
      const icon={ path:shapePath(p.type), fillColor:scHex(p.status), fillOpacity:p.locVerified?1:.75, strokeColor:sel?"#111":(p.locVerified?"#fff":scHex(p.status)), strokeWeight:sel?3:2, scale:sel?1.35:1, anchor:new g.Point(0,0) };
      let m=M.markers.get(id);
      if(!m){ m=new g.Marker({map,position:{lat:p.lat,lng:p.lng},icon,title:p.name}); m.addListener("click",()=>m._click()); M.markers.set(id,m); }
      else { m.setPosition({lat:p.lat,lng:p.lng}); m.setIcon(icon); m.setTitle(p.name); }
      m.setZIndex(sel?1000:1); m._click=onClick;
    },
    remove(id){ const m=M.markers.get(id); if(m){ m.setMap(null); M.markers.delete(id);} },
    ids:()=>[...M.markers.keys()],
    setPick(lat,lng){ if(M.pickMarker) M.pickMarker.setMap(null); M.pickMarker = lat==null?null:new g.Marker({map,position:{lat,lng},zIndex:2000}); },
    picking(on){ map.setOptions({draggableCursor:on?"crosshair":null}); }
  });
}
function initLeaflet(){
  const map=L.map("map",{zoomControl:true,minZoom:5,maxZoom:19,zoomSnap:.25});
  const osm=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
  const sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Imagery © Esri"});
  L.control.layers({"Street map":osm,"Satellite":sat},null,{position:"topleft"}).addTo(map);
  map.fitBounds(PEN);
  map.on("click",e=>M.clickCb&&M.clickCb(e.latlng.lat,e.latlng.lng));
  Object.assign(M,{
    kind:"leaflet",
    fit:b=>map.flyToBounds(b,{duration:.5}),
    flyTo:(lat,lng,z)=>map.flyTo([lat,lng],Math.max(map.getZoom(),z),{duration:.5}),
    upsert(id,p,sel,onClick){
      const html=`<span class="pin ${TCLS[p.type]||"t-other"} ${p.locVerified?"":"approx"} ${sel?"sel":""}" style="--pc:${sc(p.status)}"></span>`;
      const icon=L.divIcon({className:"",html,iconSize:[18,18],iconAnchor:[9,9]});
      let m=M.markers.get(id);
      if(!m){ m=L.marker([p.lat,p.lng],{icon,title:p.name}).addTo(map); m.on("click",()=>m._click()); M.markers.set(id,m); }
      else { m.setLatLng([p.lat,p.lng]); m.setIcon(icon); }
      m.setZIndexOffset(sel?1000:0); m._click=onClick;
    },
    remove(id){ const m=M.markers.get(id); if(m){ map.removeLayer(m); M.markers.delete(id);} },
    ids:()=>[...M.markers.keys()],
    setPick(lat,lng){ if(M.pickMarker) map.removeLayer(M.pickMarker); M.pickMarker = lat==null?null:L.circleMarker([lat,lng],{radius:10,color:css("--accent"),weight:3,fillOpacity:.2}).addTo(map); },
    picking(on){ map.getContainer().classList.toggle("picking",on); }
  });
}
M.clickCb=(lat,lng)=>{
  if(!S.pick) return;
  lat=+lat.toFixed(6); lng=+lng.toFixed(6);
  const f=$("editForm"); if(f){ f.elements.lat.value=lat; f.elements.lng.value=lng; f.elements.locVerified.checked=true; }
  M.setPick(lat,lng); setPick(false);
};
function setPick(on){ S.pick=on; $("pickBanner").hidden=!on; M.picking&&M.picking(on); const b=$("pickBtn"); if(b) b.textContent=on?"Cancel picking":"Pick on map"; }
function renderMap(rows){
  if(!M.upsert) return;
  const keep=new Set();
  rows.forEach(p=>{ if(p.lat==null||p.lng==null) return; keep.add(p._id); M.upsert(p._id,p,S.sel===p._id,()=>select(p._id)); });
  M.ids().forEach(id=>{ if(!keep.has(id)) M.remove(id); });
}

/* ================= UI ================= */
function renderChips(){
  const all=[...S.projects.values()];
  const opts=[["solar","All solar",all.filter(isSolar).length],["Solar Rooftop","Rooftop",all.filter(p=>p.type==="Solar Rooftop"||p.type==="Rooftop + Streetlight").length],["Solar Streetlight","Streetlight",all.filter(p=>p.type==="Solar Streetlight"||p.type==="Rooftop + Streetlight").length],["all","All environment",all.length]];
  $("typeChips").innerHTML=opts.map(([v,l,c])=>`<button class="chip" type="button" data-v="${v}" aria-pressed="${S.type===v}">${l}<span class="c">${c}</span></button>`).join("");
}
function renderKpis(rows){
  const val=rows.reduce((a,p)=>a+(+p.value||0),0);
  const done=rows.filter(p=>p.status==="Completed").length;
  const ong=rows.filter(p=>p.status==="Ongoing"||p.status==="Approved").length;
  const pipe=rows.filter(p=>["Site Visit","Pending Proposal","Pending Approval Memo"].includes(p.status)).length;
  const paid=rows.filter(p=>p.payment==="Paid").length;
  const noval=rows.filter(p=>!p.value).length, pinned=rows.filter(p=>p.lat!=null).length;
  const k=[["Projects",rows.length,`${pinned} on the map`],["Total value",rmShort(val),noval?`${noval} without value yet`:"All valued"],["Completed",done,rows.length?Math.round(done/rows.length*100)+"% of projects":""],["Ongoing",ong,"Approved or in progress"],["In pipeline",pipe,"Site visit to approval memo"],["Paid",`${paid}/${rows.length}`,`${rows.length-paid} not paid`]];
  $("kpis").innerHTML=k.map(([l,v,h])=>`<div class="kpi"><span class="l">${l}</span><span class="v" title="${esc(v)}">${esc(v)}</span><span class="h">${esc(h)}</span></div>`).join("");
}
function renderPipe(rows){
  const n=rows.length||1, counts=STATUSES.map(s=>[s,rows.filter(p=>p.status===s).length]);
  $("pipeBar").innerHTML=counts.filter(c=>c[1]).map(([s,c])=>`<span title="${s}: ${c}" style="width:${c/n*100}%;background:${sc(s)}"></span>`).join("");
  $("pipeLegend").innerHTML=counts.map(([s,c])=>`<button type="button" data-s="${esc(s)}" aria-pressed="${S.status===s}"><span class="dot" style="background:${sc(s)}"></span>${s} <span class="num">${c}</span></button>`).join("")+(S.status?`<button type="button" data-s="">Clear status filter</button>`:"");
}
function renderList(rows){
  $("listCount").textContent=`${rows.length} shown`;
  if(!S.loaded) return;
  if(!rows.length){
    $("list").innerHTML = S.projects.size ? `<div class="empty">${S.year?`No ${S.year} projects match these filters.`:"No projects match these filters."}</div>`
      : `<div class="empty">No projects yet.${S.canWrite?`<br><br><button class="btn primary" type="button" id="importFile">Import a project list</button>`:" An editor needs to add the first project."}</div>`;
    if($("importFile")) $("importFile").onclick=()=>$("importAny").click();
    return;
  }
  $("list").innerHTML=rows.map(p=>`<button type="button" class="item ${S.sel===p._id?"sel":""}" data-id="${p._id}">
    <span class="no">${p.no??""}</span><span class="nm">${esc(p.name)}</span><span class="val">${p.value?rmShort(p.value):"—"}</span>
    <span class="meta"><span class="pill" style="--pc:${sc(p.status)}"><span class="dot"></span>${esc(p.status||"No status")}</span><span>${esc(p.state||"")}</span><span>${esc(p.type||"")}</span>${p.lat==null?'<span>No pin</span>':(p.locVerified?'':'<span>Approx. pin</span>')}</span>
  </button>`).join("");
}
function select(id,pan){
  S.sel=id; S.editing=null; S.confirmDel=false; setPick(false); M.setPick&&M.setPick(null);
  const p=S.projects.get(id);
  if(pan && p && p.lat!=null) M.flyTo(p.lat,p.lng,12);
  render();
  if(window.innerWidth<960) $("side").scrollIntoView({behavior:"smooth",block:"start"});
}
function closeDetail(){ S.sel=null; S.editing=null; setPick(false); M.setPick&&M.setPick(null); render(); }
function renderSide(){
  const p = S.editing || (S.sel && S.projects.get(S.sel));
  $("list").hidden=!!p; $("detail").hidden=!p; $("listCount").hidden=!!p;
  $("sideTitle").textContent = S.editing ? (S.editing._id?"Edit project":"New project") : p ? "Project details" : "Projects";
  if(!p) return;
  if(S.editing) return renderEdit(S.editing);
  const flag=(v,ok)=>`<span class="flag ${v===ok?"ok":"no"}">${esc(v||"—")}</span>`;
  $("detail").innerHTML=`
    <div class="row-actions"><button class="btn small" type="button" id="backBtn">← All projects</button></div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <span class="pill" style="--pc:${sc(p.status)};align-self:flex-start"><span class="dot"></span>${esc(p.status||"No status")}</span>
      <h3>${esc(p.name)}</h3>
      <div class="status-line">${esc(p.component||"")} · ${esc(p.type||"")} · No. ${p.no??"—"}</div>
    </div>
    <dl class="dl">
      <dt>Project value</dt><dd class="num">${rm(p.value)}</dd>
      <dt>Capacity</dt><dd>${[p.kwp?`<span class="num">${p.kwp}</span> kWp`:"",p.units?`<span class="num">${p.units}</span> streetlight units`:""].filter(Boolean).join(" · ")||'<span class="status-line">Not recorded</span>'}</dd>
      <dt>State</dt><dd>${esc(p.state||"—")}</dd>
      <dt>Application received</dt><dd>${fmtDate(p.appDate)}</dd>
      <dt>Completion date</dt><dd>${fmtDate(p.completionDate)}</dd>
      <dt>Invoice</dt><dd>${flag(p.invoice,"Received")}</dd>
      <dt>Payment</dt><dd>${flag(p.payment,"Paid")}${p.nposNo?` <span class="status-line">NPOS ${esc(p.nposNo)}${p.nposDate?", "+fmtDate(p.nposDate):""}</span>`:""}</dd>
      <dt>Remarks</dt><dd>${esc(p.remarks||"—")}</dd>
    </dl>
    <div class="photos-box">
      <div class="photos-head"><strong>Photos</strong>${S.canWrite?`<button class="btn small" type="button" id="addPhotosBtn">+ Add photos</button>`:""}</div>
      <div id="photoGrid" class="photo-grid"></div>
    </div>
    <div class="loc">
      <strong>Location</strong>
      ${p.lat!=null?`<span class="num">${p.lat}, ${p.lng}</span><span class="status-line">${p.locVerified?"Exact location confirmed":"Approximate pin placed from the project name. Edit the project to set the exact spot."}</span>`:`<span class="status-line">No pin yet${p.state==="Nationwide"?" (nationwide project)":""}.</span>`}
      <a href="${gmaps(p)}" target="_blank" rel="noopener">Open in Google Maps ↗</a>
    </div>
    ${S.canWrite?`<div class="row-actions"><button class="btn primary" type="button" id="editBtn">Edit project</button><button class="btn danger" type="button" id="delBtn">Delete</button></div>`:""}
    ${S.confirmDel?`<div class="confirm"><span>Delete “${esc(p.name)}” for everyone?</span><button class="btn small danger" type="button" id="delYes">Delete</button><button class="btn small" type="button" id="delNo">Keep it</button></div>`:""}
    ${p.updatedAt?`<div class="status-line">Last updated ${new Date(p.updatedAt).toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}${p.updatedBy?" by "+esc(p.updatedBy):""}</div>`:""}`;
  $("backBtn").onclick=closeDetail;
  if($("addPhotosBtn")) $("addPhotosBtn").onclick=()=>$("photoInput").click();
  renderPhotos();
  if($("editBtn")) $("editBtn").onclick=()=>{ S.editing={...p}; render(); };
  if($("delBtn")) $("delBtn").onclick=()=>{ S.confirmDel=true; render(); };
  if($("delYes")) $("delYes").onclick=async()=>{ try{ const ph=await getDocs(collection(db,"projects",p._id,"photos")); for(const d of ph.docs) await deleteDoc(d.ref); await deleteDoc(doc(db,"projects",p._id)); S.sel=null; S.confirmDel=false; toast("Project deleted"); render(); }catch(e){ toast(permMsg(e)); } };
  if($("delNo")) $("delNo").onclick=()=>{ S.confirmDel=false; render(); };
}
const permMsg = e => e && e.code==="permission-denied" ? "Your account isn’t on the editor list. Ask the owner to add you." : "Couldn’t save: "+(e.message||e.code||e);
function opt(list,v,blank){ return (blank?`<option value="">${blank}</option>`:"")+list.map(x=>`<option ${x===v?"selected":""}>${esc(x)}</option>`).join(""); }
function renderEdit(p){
  $("detail").innerHTML=`
  <form class="edit" id="editForm" novalidate>
    <label class="full">Project name<input id="e-name" name="name" required value="${esc(p.name||"")}"></label>
    <label>Project type<select id="e-type" name="type">${opt(TYPES,p.type||"Solar Rooftop")}</select></label>
    <label>Component<select id="e-component" name="component">${opt(COMPONENTS,p.component,"—")}</select></label>
    <label>Status<select id="e-status" name="status">${opt(STATUSES,p.status||"Site Visit")}</select></label>
    <label>State<select id="e-state" name="state">${opt(STATES,p.state,"—")}</select></label>
    <label>Project value (RM)<input id="e-value" name="value" type="number" step="0.01" min="0" inputmode="decimal" value="${p.value??""}"></label>
    <label>Year<select id="e-year" name="year">${opt(YEARS.map(String),String(projYear(p)||S.year||new Date().getFullYear()))}</select></label>
    <label>Month<select id="e-month" name="month">${opt(MONTHS,p.month,"—")}</select></label>
    <label>Capacity (kWp)<input id="e-kwp" name="kwp" type="number" step="0.01" min="0" value="${p.kwp??""}"></label>
    <label>Streetlight units<input id="e-units" name="units" type="number" step="1" min="0" value="${p.units??""}"></label>
    <label>Application received<input id="e-appDate" name="appDate" type="date" value="${p.appDate||""}"></label>
    <label>Completion date<input id="e-completionDate" name="completionDate" type="date" value="${p.completionDate||""}"></label>
    <label>Invoice<select id="e-invoice" name="invoice">${opt(["Not Received","Received"],p.invoice||"Not Received")}</select></label>
    <label>Payment<select id="e-payment" name="payment">${opt(["Not Paid","Paid"],p.payment||"Not Paid")}</select></label>
    <label>NPOS payment no.<input id="e-nposNo" name="nposNo" value="${esc(p.nposNo||"")}"></label>
    <label>NPOS payment date<input id="e-nposDate" name="nposDate" type="date" value="${p.nposDate||""}"></label>
    <label class="full">Remarks<textarea id="e-remarks" name="remarks">${esc(p.remarks||"")}</textarea></label>
    <div class="full loc">
      <strong>Location</strong>
      <label>Paste a Google Maps link or “lat, lng”<input id="e-paste" name="paste" placeholder="e.g. 3.1390, 101.6869"></label>
      <span class="hint" id="pasteHint">Easiest: click “Pick on map”, switch to satellite and click the exact rooftop. Or right-click the spot in Google Maps, copy the coordinates and paste them here.</span>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label>Latitude<input id="e-lat" name="lat" type="number" step="any" value="${p.lat??""}"></label>
        <label>Longitude<input id="e-lng" name="lng" type="number" step="any" value="${p.lng??""}"></label>
      </div>
      <label style="flex-direction:row;align-items:center;gap:8px;color:var(--fg)"><input id="e-locVerified" name="locVerified" type="checkbox" style="width:auto" ${p.locVerified?"checked":""}>This is the exact location</label>
      <div class="row-actions"><button class="btn small" type="button" id="pickBtn">Pick on map</button></div>
    </div>
    <div class="full row-actions"><button class="btn primary" type="submit" id="saveBtn">Save</button><button class="btn" type="button" id="cancelBtn">Cancel</button></div>
  </form>`;
  const f=$("editForm");
  f.elements.paste.addEventListener("input",e=>{
    const v=e.target.value.trim(); if(!v) return;
    const ll=parseLatLng(v);
    if(ll){ f.elements.lat.value=ll[0]; f.elements.lng.value=ll[1]; f.elements.locVerified.checked=true; $("pasteHint").textContent=`Location set to ${ll[0]}, ${ll[1]}.`; M.setPick(ll[0],ll[1]); M.flyTo(ll[0],ll[1],16); }
    else $("pasteHint").textContent = /goo\.gl|maps\.app/.test(v) ? "Short links can’t be read. Open the link, right-click the spot to copy its coordinates, and paste them here." : "Couldn’t find coordinates in that text.";
  });
  $("pickBtn").onclick=()=>setPick(!S.pick);
  $("cancelBtn").onclick=()=>{ const id=S.editing._id; S.editing=null; setPick(false); M.setPick(null); S.sel=id||null; render(); };
  f.addEventListener("submit",async e=>{
    e.preventDefault();
    const g=n=>f.elements[n].value.trim(), num=n=>{const v=g(n); return v===""?null:Number(v);};
    if(!g("name")){ f.elements.name.focus(); toast("Add a project name"); return; }
    const lat=num("lat"), lng=num("lng");
    if((lat==null)!==(lng==null) || (lat!=null && (Math.abs(lat)>90||Math.abs(lng)>180))){ toast("Enter both latitude and longitude, or leave both empty"); return; }
    const data={ no:S.editing.no ?? nextNo(), year:+g("year"), name:g("name"), type:g("type"), component:g("component")||null, status:g("status"), state:g("state")||null, value:num("value"), month:g("month")||null, kwp:num("kwp"), units:num("units"), appDate:g("appDate")||null, completionDate:g("completionDate")||null, invoice:g("invoice"), payment:g("payment"), nposNo:g("nposNo"), nposDate:g("nposDate")||null, remarks:g("remarks"), lat, lng, locVerified: lat!=null && f.elements.locVerified.checked, updatedAt:new Date().toISOString(), updatedBy:S.user?.email||"" };
    $("saveBtn").disabled=true;
    try{
      const ref = S.editing._id ? doc(db,"projects",S.editing._id) : doc(collection(db,"projects"));
      await setDoc(ref,data);
      S.editing=null; S.sel=ref.id; setPick(false); M.setPick(null); toast("Saved"); render();
    }catch(err){ $("saveBtn").disabled=false; toast(permMsg(err)); }
  });
  if(p.lat!=null) M.setPick(p.lat,p.lng);
}
function parseLatLng(s){
  const m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || s.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/) || s.match(/^\s*\(?\s*(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{2,3}\.\d+)\s*\)?\s*$/);
  if(!m) return null; const a=+(+m[1]).toFixed(6), b=+(+m[2]).toFixed(6);
  return Math.abs(a)<=90&&Math.abs(b)<=180 ? [a,b] : null;
}
function nextNo(){ return Math.max(0,...[...S.projects.values()].map(p=>p.no||0))+1; }
function renderStateBars(rows){
  const by={};
  rows.forEach(p=>{ const s=p.state||"Unassigned"; (by[s]=by[s]||{total:0,n:0,seg:{}}); by[s].total+=(+p.value||0); by[s].n++; by[s].seg[p.status]=(by[s].seg[p.status]||0)+(+p.value||0); });
  const arr=Object.entries(by).sort((a,b)=>b[1].total-a[1].total), max=Math.max(1,...arr.map(a=>a[1].total));
  $("stateBars").innerHTML = arr.length ? arr.map(([s,d])=>`<div class="bar"><span class="lab" title="${esc(s)}">${esc(s)} <span class="status-line">(${d.n})</span></span><span class="track">${STATUSES.filter(x=>d.seg[x]).map(x=>`<span title="${x}: ${rm(d.seg[x])}" style="width:${d.seg[x]/max*100}%;background:${sc(x)}"></span>`).join("")}</span><span class="n">${rmShort(d.total)}</span></div>`).join("") : `<div class="empty">No projects match these filters.</div>`;
}
function renderPayBars(rows){
  const n=rows.length||1, inv=rows.filter(p=>p.invoice==="Received").length, paid=rows.filter(p=>p.payment==="Paid").length;
  const paidVal=rows.filter(p=>p.payment==="Paid").reduce((a,p)=>a+(+p.value||0),0), tot=rows.reduce((a,p)=>a+(+p.value||0),0);
  const row=(l,a,b,txt)=>`<div class="bar"><span class="lab">${l}</span><span class="track"><span style="width:${a/b*100}%;background:var(--good)"></span><span style="width:${(b-a)/b*100}%;background:color-mix(in srgb,var(--bad) 55%,transparent)"></span></span><span class="n">${txt}</span></div>`;
  $("payBars").innerHTML=row("Invoice received",inv,n,`${inv} / ${rows.length}`)+row("Paid",paid,n,`${paid} / ${rows.length}`)+row("Value paid",paidVal,tot||1,rmShort(paidVal));
  const sl=rows.filter(p=>p.type==="Solar Streetlight"||p.type==="Rooftop + Streetlight"), rf=rows.filter(p=>p.type==="Solar Rooftop"||p.type==="Rooftop + Streetlight");
  const units=sl.reduce((a,p)=>a+(+p.units||0),0), kwp=rf.reduce((a,p)=>a+(+p.kwp||0),0), doneUnits=sl.filter(p=>p.status==="Completed").reduce((a,p)=>a+(+p.units||0),0);
  $("capBars").innerHTML=row("Streetlights installed",doneUnits,units||1,`${doneUnits} / ${units} units`)+`<div class="bar"><span class="lab">Rooftop capacity</span><span class="track"></span><span class="n">${kwp?kwp.toLocaleString()+" kWp":"—"}</span></div>`;
  const missing=rf.filter(p=>!p.kwp).length;
  $("capNote").textContent = missing ? `${missing} rooftop project${missing>1?"s have":" has"} no kWp recorded yet. Add it when editing a project.` : "";
}
function render(){
  renderChips();
  const all=filtered(true), rows=filtered(false);
  renderKpis(all); renderPipe(all); renderMap(rows); renderStateBars(all); renderPayBars(all);
  if(!S.editing || !$("editForm")){ renderList(rows); renderSide(); }
  $("addBtn").hidden=!S.canWrite; $("importBtn").hidden=!S.canWrite; renderTitle(); syncPhotos();
}

/* events */
$("typeChips").addEventListener("click",e=>{const b=e.target.closest("button"); if(!b) return; S.type=b.dataset.v; try{localStorage.setItem("csr-type",S.type)}catch(e){} render();});
$("fYear").innerHTML=`<option value="">All years (2025–2030)</option>`+YEARS.map(y=>`<option ${String(y)===S.year?"selected":""}>${y}</option>`).join("");
$("fYear").onchange=e=>{S.year=e.target.value; try{localStorage.setItem("csr-year",S.year)}catch(e){} S.sel=null; render();};
$("importBtn").onclick=()=>$("importAny").click();
$("importAny").onchange=e=>{ const f=e.target.files[0]; e.target.value=""; if(f) importFile(f); };
STATES.forEach(s=>$("fState").insertAdjacentHTML("beforeend",`<option>${s}</option>`));
COMPONENTS.forEach(s=>$("fComp").insertAdjacentHTML("beforeend",`<option>${s}</option>`));
$("fState").onchange=e=>{S.state=e.target.value;render();};
$("fComp").onchange=e=>{S.comp=e.target.value;render();};
$("fSearch").oninput=e=>{S.q=e.target.value;render();};
$("pipeLegend").addEventListener("click",e=>{const b=e.target.closest("button"); if(!b) return; S.status = S.status===b.dataset.s ? "" : b.dataset.s; render();});
$("list").addEventListener("click",e=>{const b=e.target.closest(".item"); if(b) select(b.dataset.id,true);});
$("viewPen").onclick=()=>M.fit&&M.fit(PEN);
$("viewAll").onclick=()=>M.fit&&M.fit(ALL);
$("addBtn").onclick=()=>{ S.sel=null; S.editing={ _id:null, year:+(S.year||new Date().getFullYear()), type:"Solar Rooftop", status:"Site Visit", component:"Komuniti Lestari", invoice:"Not Received", payment:"Not Paid" }; renderSide(); if(window.innerWidth<960) $("side").scrollIntoView({behavior:"smooth"}); };
$("exportBtn").onclick=()=>{
  if(!window.XLSX){ toast("Export isn’t available right now"); return; }
  const rows=[...S.projects.values()].sort((a,b)=>(a.no||0)-(b.no||0)).map(p=>({"Year":projYear(p),"No.":p.no,"Component":p.component,"Project Name":p.name,"Type":p.type,"State":p.state,"Month":p.month,"Application Received Date":p.appDate,"Project Value (RM)":p.value,"Capacity (kWp)":p.kwp,"Streetlight Units":p.units,"Project Status":p.status,"Project Completion Date":p.completionDate,"Invoice Status":p.invoice,"Payment Status":p.payment,"NPOS Payment No.":p.nposNo,"NPOS Payment Date":p.nposDate,"Remarks":p.remarks,"Latitude":p.lat,"Longitude":p.lng,"Exact Location":p.locVerified?"Yes":"No","Google Maps":p.lat!=null?gmaps(p):""}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Masterlist");
  XLSX.writeFile(wb,`CSR Solar Projects ${new Date().toISOString().slice(0,10)}.xlsx`);
};

/* ================= FIREBASE ================= */
const configured = CONFIG.firebase && CONFIG.firebase.projectId;
let db=null, auth=null;
function renderTitle(){ const base=(CONFIG.title||"CSR Solar Projects").replace(/\s*20\d\d$/,""); const t=`${base} ${S.year||"2025–2030"}`; $("appTitle").textContent=t; document.title=t; }
render();
initMap().then(render);

if(!configured){
  $("signInBtn").hidden=true; S.loaded=true;
  $("syncNote").textContent="Setup needed: add the Firebase settings to config.js (see SETUP.md).";
  render();
} else {
  startFirebase().catch(e=>{ console.error(e); $("syncNote").textContent="Couldn’t connect to the database: "+(e.message||e); });
}
async function startFirebase(){
  const [a,b,c]=await Promise.all([import(FB+"firebase-app.js"),import(FB+"firebase-auth.js"),import(FB+"firebase-firestore.js")]);
  ({initializeApp}=a); ({getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged}=b); ({getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, getDoc, getDocs, updateDoc}=c);
  const app=initializeApp(CONFIG.firebase); db=getFirestore(app); auth=getAuth(app);
  $("signInBtn").onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(e=>{ if(e.code!=="auth/popup-closed-by-user") toast("Sign-in didn’t finish: "+e.code); });
  $("signOutBtn").onclick=()=>signOut(auth);
  let unsub=null;
  onAuthStateChanged(auth, async user=>{
    S.user=user; S.canWrite=false;
    $("signInBtn").hidden=!!user; $("signOutBtn").hidden=!user; $("who").textContent=user?user.email:"";
    if(unsub){ unsub(); unsub=null; }
    S.projects=new Map(); S.loaded=false; render();
    if(user){
      try{ const a=await getDoc(doc(db,"config","access")); const ed=(a.exists()&&a.data().editors)||[]; S.canWrite=ed.map(x=>String(x).toLowerCase()).includes((user.email||"").toLowerCase()); }catch(e){ S.canWrite=false; }
    }
    $("syncNote").textContent="Loading…";
    unsub=onSnapshot(collection(db,"projects"), snap=>{
      S.projects=new Map(snap.docs.map(d=>[d.id,{...d.data(),_id:d.id}])); S.loaded=true;
      $("syncNote").textContent = S.canWrite ? "Live. You can edit; changes save for everyone." : user ? "Live. View only (ask the owner for edit access)." : "Live. Sign in to edit.";
      if(S.sel && !S.projects.has(S.sel)) S.sel=null;
      render();
    }, err=>{
      S.loaded=true;
      if(err.code==="permission-denied"){ $("syncNote").textContent = user ? "Your account doesn’t have access yet. Ask the owner to add your email." : "Sign in with your Google account to see the projects."; $("list").innerHTML=`<div class="empty">${esc($("syncNote").textContent)}</div>`; }
      else $("syncNote").textContent="Couldn’t load the projects: "+err.code;
    });
  });
}
const COLS={no:["no."],component:["component"],name:["project name"],state:["state"],month:["month"],appDate:["application received date"],value:["project value (rm)"],status:["project status"],completionDate:["project completion date"],invoice:["invoice status"],payment:["payment status"],nposNo:["npos payment no."],nposDate:["npos payment date"],remarks:["remarks"],year:["year","tahun"],type:["type"],kwp:["capacity (kwp)","kwp"],units:["streetlight units"],lat:["latitude"],lng:["longitude"]};
const norm=h=>String(h??"").toLowerCase().replace(/\s+/g," ").trim();
const isoDate=v=>{ if(v==null||v==="") return null; if(typeof v==="number"&&v>20000&&v<80000){ const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*864e5); return d.toISOString().slice(0,10); } if(v instanceof Date&&!isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,"0")}-${String(v.getDate()).padStart(2,"0")}`; const s=String(v).trim(); let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[0]; m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/); if(m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`; m=s.match(/^(\d{2})(\d{2})(\d{4})$/); if(m) return `${m[3]}-${m[2]}-${m[1]}`; return null; };
const numv=v=>{ if(v==null||v==="") return null; const n=Number(String(v).replace(/[^0-9.\-]/g,"")); return String(v).trim()===""||isNaN(n)?null:n; };
function guessType(n){ n=n.toLowerCase(); const r=n.includes("rooftop")||n.includes("solar di "); const st=n.includes("streetlight")||n.includes("lampu jalan"); return r&&st?"Rooftop + Streetlight":r?"Solar Rooftop":st?"Solar Streetlight":"Other"; }
async function readRows(file){
  if(/\.json$/i.test(file.name)){
    const rows=JSON.parse(await file.text());
    if(!Array.isArray(rows)||!rows.every(r=>r&&r.data&&r.data.name)) throw new Error("This isn’t a projects file.");
    return rows.map(r=>r.data);
  }
  if(!window.XLSX) throw new Error("Excel import isn’t available right now. Reload the page and try again.");
  const wb=XLSX.read(await file.arrayBuffer());
  const name=wb.SheetNames.find(n=>norm(n)==="masterlist")||wb.SheetNames[0];
  const grid=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null});
  const hi=grid.findIndex(r=>r.some(c=>norm(c)==="project name"));
  if(hi<0) throw new Error(`Couldn’t find a “Project Name” column in sheet “${name}”. Use the same columns as the Masterlist sheet.`);
  const head=grid[hi].map(norm), col={};
  for(const [k,names] of Object.entries(COLS)){ const i=head.findIndex(h=>names.includes(h)); if(i>=0) col[k]=i; }
  const fallbackYear=+(S.year||new Date().getFullYear());
  return grid.slice(hi+1).filter(r=>r[col.name]&&String(r[col.name]).trim()).map(r=>{
    const g=k=>col[k]==null?null:r[col[k]];
    const nm=String(g("name")).replace(/\s+/g," ").trim(), app=isoDate(g("appDate"));
    const um=nm.match(/(\d+)\s*unit/i), units=numv(g("units")) ?? (um?+um[1]:null);
    const lat=numv(g("lat")), lng=numv(g("lng")), both=lat!=null&&lng!=null;
    const yr=numv(g("year")) || (app?+app.slice(0,4):fallbackYear);
    return { no:numv(g("no")), year:yr, component:g("component")||null, name:nm, type:TYPES.includes(g("type"))?g("type"):guessType(nm), state:g("state")||null, month:g("month")||null, appDate:app, value:numv(g("value")), status:STATUSES.includes(g("status"))?g("status"):"Site Visit", completionDate:isoDate(g("completionDate")), invoice:g("invoice")==="Received"?"Received":"Not Received", payment:g("payment")==="Paid"?"Paid":"Not Paid", nposNo:g("nposNo")!=null?String(g("nposNo")):"", nposDate:isoDate(g("nposDate")), remarks:g("remarks")!=null?String(g("remarks")):"", kwp:numv(g("kwp")), units, lat:both?lat:null, lng:both?lng:null, locVerified:false };
  });
}
async function importFile(file){
  if(!db){ toast("Finish setup before importing."); return; }
  try{
    const rows=await readRows(file);
    const key=p=>`${projYear(p)}|${String(p.name).toLowerCase().replace(/\s+/g," ").trim()}`;
    const have=new Set([...S.projects.values()].map(key));
    const seen=new Set(), fresh=rows.filter(r=>{ const k=key(r); if(have.has(k)||seen.has(k)) return false; seen.add(k); return true; });
    const skipped=rows.length-fresh.length;
    if(!fresh.length){ toast(rows.length?`Nothing new: all ${rows.length} projects are already in the dashboard.`:"No projects found in that file."); return; }
    const now=new Date().toISOString(), by=S.user?.email||"";
    for(let i=0;i<fresh.length;i+=400){ const b=writeBatch(db); fresh.slice(i,i+400).forEach(r=>b.set(doc(collection(db,"projects")),{...r,updatedAt:now,updatedBy:by})); await b.commit(); }
    const yrs=[...new Set(fresh.map(projYear))].sort().join(", ");
    toast(`Imported ${fresh.length} project${fresh.length>1?"s":""} for ${yrs}${skipped?`. Skipped ${skipped} already in the dashboard.`:"."}`);
  }catch(e){ toast(e.code?permMsg(e):(e.message||"Import failed")); }
}

/* ================= PHOTOS =================
   Stored in Firestore (no billing needed): projects/{id}/photos/{photoId}
   Each photo is shrunk in the browser to fit well under Firestore's 1 MB document limit. */
function syncPhotos(){
  const want = db && S.sel && !S.editing ? S.sel : null;
  if(want===PH.for) return;
  if(PH.unsub){ PH.unsub(); PH.unsub=null; }
  PH.for=want; PH.list=[]; PH.loading=!!want;
  if(!want) return;
  PH.unsub=onSnapshot(collection(db,"projects",want,"photos"), snap=>{
    PH.loading=false;
    PH.list=snap.docs.map(d=>({...d.data(),_id:d.id})).sort((a,b)=>String(a.takenAt||a.uploadedAt).localeCompare(String(b.takenAt||b.uploadedAt)));
    renderPhotos(); if(PH.open) renderLightbox();
  }, err=>{ PH.loading=false; renderPhotos(err.code==="permission-denied"?"Photos need the updated access rules (see SETUP.md).":"Couldn’t load photos."); });
}
function renderPhotos(msg){
  const g=$("photoGrid"); if(!g) return;
  if(msg){ g.innerHTML=`<span class="status-line">${esc(msg)}</span>`; return; }
  if(!db){ g.innerHTML=`<span class="status-line">Photos are available once setup is finished.</span>`; return; }
  const busy = PH.busy?`<div class="ph-tile ph-busy">Uploading ${PH.busy}…</div>`:"";
  if(PH.loading){ g.innerHTML=`<span class="status-line">Loading photos…</span>`; return; }
  if(!PH.list.length && !PH.busy){ g.innerHTML=`<span class="status-line">No photos yet.${S.canWrite?" Add site visit, installation or completion photos.":""}</span>`; return; }
  g.innerHTML=PH.list.map((ph,i)=>`<button type="button" class="ph-tile" data-i="${i}" title="${esc(ph.caption||"")}"><img src="${ph.thumb||ph.data}" alt="${esc(ph.caption||"Project photo")}" loading="lazy"></button>`).join("")+busy;
  g.querySelectorAll(".ph-tile[data-i]").forEach(b=>b.onclick=()=>{ PH.open=PH.list[+b.dataset.i]._id; renderLightbox(); });
}
function loadImage(file){
  return new Promise((res,rej)=>{ const url=URL.createObjectURL(file), img=new Image(); img.onload=()=>{ URL.revokeObjectURL(url); res(img); }; img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error("unreadable")); }; img.src=url; });
}
function shrink(img,maxSide,quality){
  const r=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement("canvas"); c.width=Math.round(img.naturalWidth*r); c.height=Math.round(img.naturalHeight*r);
  const x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height);
  return { url:c.toDataURL("image/jpeg",quality), w:c.width, h:c.height };
}
async function addPhotos(files){
  const pid=S.sel; if(!pid||!files.length) return;
  let ok=0, bad=[];
  PH.busy=files.length; renderPhotos();
  for(const f of files){
    try{
      if(!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) throw new Error("not an image");
      const img=await loadImage(f);
      let side=1600, q=.78, full=shrink(img,side,q);
      while(full.url.length>850000 && side>600){ side=Math.round(side*.8); q=Math.max(.6,q-.05); full=shrink(img,side,q); }
      const thumb=shrink(img,360,.7);
      const taken=f.lastModified?new Date(f.lastModified).toISOString():new Date().toISOString();
      await setDoc(doc(collection(db,"projects",pid,"photos")),{ data:full.url, thumb:thumb.url, w:full.w, h:full.h, caption:"", fileName:f.name, takenAt:taken, uploadedAt:new Date().toISOString(), uploadedBy:S.user?.email||"" });
      ok++;
    }catch(e){ bad.push(f.name); if(e.code==="permission-denied"){ toast(permMsg(e)); break; } }
    PH.busy--; renderPhotos();
  }
  PH.busy=0; renderPhotos();
  if(bad.length) toast(`${ok} added. Couldn’t read ${bad.length} file${bad.length>1?"s":""} (${bad.slice(0,2).join(", ")}${bad.length>2?"…":""}). iPhone HEIC photos may need to be saved as JPEG first.`);
  else if(ok) toast(`${ok} photo${ok>1?"s":""} added`);
}
function renderLightbox(){
  const lb=$("lightbox"), i=PH.list.findIndex(x=>x._id===PH.open);
  if(i<0){ PH.open=null; lb.hidden=true; return; }
  const ph=PH.list[i], when=ph.takenAt?new Date(ph.takenAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"";
  lb.hidden=false;
  lb.innerHTML=`<div class="lb-inner" role="dialog" aria-label="Photo ${i+1} of ${PH.list.length}">
    <div class="lb-top"><span class="status-line">${i+1} / ${PH.list.length}${when?" · "+when:""}${ph.uploadedBy?" · added by "+esc(ph.uploadedBy):""}</span><button class="btn small" type="button" id="lbClose">Close ✕</button></div>
    <div class="lb-img"><button class="lb-nav" type="button" id="lbPrev" aria-label="Previous" ${i===0?"disabled":""}>‹</button><img src="${ph.data}" alt="${esc(ph.caption||"Project photo")}"><button class="lb-nav" type="button" id="lbNext" aria-label="Next" ${i===PH.list.length-1?"disabled":""}>›</button></div>
    ${S.canWrite?`<div class="lb-edit"><input id="lbCaption" placeholder="Add a caption, e.g. Panels installed on main hall roof" value="${esc(ph.caption||"")}"><button class="btn small primary" type="button" id="lbSave">Save caption</button><button class="btn small danger" type="button" id="lbDel">Delete photo</button></div><div id="lbConfirm"></div>`:(ph.caption?`<div class="lb-cap">${esc(ph.caption)}</div>`:"")}
  </div>`;
  const go=d=>{ const n=PH.list[i+d]; if(n){ PH.open=n._id; renderLightbox(); } };
  $("lbClose").onclick=closeLightbox; $("lbPrev").onclick=()=>go(-1); $("lbNext").onclick=()=>go(1);
  if($("lbSave")) $("lbSave").onclick=async()=>{ try{ await updateDoc(doc(db,"projects",PH.for,"photos",ph._id),{caption:$("lbCaption").value.trim()}); toast("Caption saved"); }catch(e){ toast(permMsg(e)); } };
  if($("lbDel")) $("lbDel").onclick=()=>{ $("lbConfirm").innerHTML=`<div class="confirm"><span>Delete this photo for everyone?</span><button class="btn small danger" type="button" id="lbDelYes">Delete</button><button class="btn small" type="button" id="lbDelNo">Keep it</button></div>`;
    $("lbDelNo").onclick=()=>$("lbConfirm").innerHTML="";
    $("lbDelYes").onclick=async()=>{ try{ const next=PH.list[i+1]||PH.list[i-1]; await deleteDoc(doc(db,"projects",PH.for,"photos",ph._id)); PH.open=next?next._id:null; toast("Photo deleted"); if(!PH.open) closeLightbox(); }catch(e){ toast(permMsg(e)); } }; };
}
function closeLightbox(){ PH.open=null; $("lightbox").hidden=true; $("lightbox").innerHTML=""; }
$("photoInput").onchange=e=>{ const fs=[...e.target.files]; e.target.value=""; addPhotos(fs); };
$("lightbox").addEventListener("click",e=>{ if(e.target.id==="lightbox") closeLightbox(); });
document.addEventListener("keydown",e=>{ if(!PH.open||e.target.tagName==="INPUT") return; if(e.key==="Escape") closeLightbox(); if(e.key==="ArrowLeft") $("lbPrev")?.click(); if(e.key==="ArrowRight") $("lbNext")?.click(); });
