import { CONFIG } from "./config.js";
const FB="https://www.gstatic.com/firebasejs/10.12.2/";
let initializeApp, getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, getDoc;

const STATUSES = ["Site Visit","Pending Proposal","Pending Approval Memo","Approved","Ongoing","Completed"];
const SVAR = {"Site Visit":"--s-visit","Pending Proposal":"--s-proposal","Pending Approval Memo":"--s-memo","Approved":"--s-approved","Ongoing":"--s-ongoing","Completed":"--s-done"};
const TYPES = ["Solar Rooftop","Solar Streetlight","Rooftop + Streetlight","Other"];
const TCLS = {"Solar Rooftop":"t-rooftop","Solar Streetlight":"t-street","Rooftop + Streetlight":"t-both","Other":"t-other"};
const STATES = ["Johor","Kedah","Kelantan","Malacca","Negeri Sembilan","Pahang","Perak","Perlis","Penang","Sabah","Sarawak","Selangor","Terengganu","W.P. Kuala Lumpur","W.P. Labuan","W.P. Putrajaya","Nationwide"];
const COMPONENTS = ["Komuniti Lestari","Tree for a Tree","Pulau Tenaga Hijau","Biodiversity","Firefly Conservation","Extinction Species"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const PEN=[[1.2,99.6],[6.8,104.6]], ALL=[[0.8,99.6],[7.4,119.3]];

const S = { projects:new Map(), type:"solar", status:"", state:"", comp:"", q:"", sel:null, editing:null, confirmDel:false, pick:false, canWrite:false, user:null, loaded:false };
try{ const t=localStorage.getItem("csr-type"); if(t) S.type=t; }catch(e){}

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
    $("list").innerHTML = S.projects.size ? `<div class="empty">No projects match these filters.</div>`
      : `<div class="empty">No projects yet.${S.canWrite?`<br><br><label class="btn primary" for="importFile">Import projects file (.json)</label><input type="file" id="importFile" accept=".json,application/json" hidden>`:" An editor needs to add the first project."}</div>`;
    if($("importFile")) $("importFile").onchange=e=>e.target.files[0]&&importSeed(e.target.files[0]);
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
    <div class="loc">
      <strong>Location</strong>
      ${p.lat!=null?`<span class="num">${p.lat}, ${p.lng}</span><span class="status-line">${p.locVerified?"Exact location confirmed":"Approximate pin placed from the project name. Edit the project to set the exact spot."}</span>`:`<span class="status-line">No pin yet${p.state==="Nationwide"?" (nationwide project)":""}.</span>`}
      <a href="${gmaps(p)}" target="_blank" rel="noopener">Open in Google Maps ↗</a>
    </div>
    ${S.canWrite?`<div class="row-actions"><button class="btn primary" type="button" id="editBtn">Edit project</button><button class="btn danger" type="button" id="delBtn">Delete</button></div>`:""}
    ${S.confirmDel?`<div class="confirm"><span>Delete “${esc(p.name)}” for everyone?</span><button class="btn small danger" type="button" id="delYes">Delete</button><button class="btn small" type="button" id="delNo">Keep it</button></div>`:""}
    ${p.updatedAt?`<div class="status-line">Last updated ${new Date(p.updatedAt).toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}${p.updatedBy?" by "+esc(p.updatedBy):""}</div>`:""}`;
  $("backBtn").onclick=closeDetail;
  if($("editBtn")) $("editBtn").onclick=()=>{ S.editing={...p}; render(); };
  if($("delBtn")) $("delBtn").onclick=()=>{ S.confirmDel=true; render(); };
  if($("delYes")) $("delYes").onclick=async()=>{ try{ await deleteDoc(doc(db,"projects",p._id)); S.sel=null; S.confirmDel=false; toast("Project deleted"); render(); }catch(e){ toast(permMsg(e)); } };
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
    const data={ no:S.editing.no ?? nextNo(), name:g("name"), type:g("type"), component:g("component")||null, status:g("status"), state:g("state")||null, value:num("value"), month:g("month")||null, kwp:num("kwp"), units:num("units"), appDate:g("appDate")||null, completionDate:g("completionDate")||null, invoice:g("invoice"), payment:g("payment"), nposNo:g("nposNo"), nposDate:g("nposDate")||null, remarks:g("remarks"), lat, lng, locVerified: lat!=null && f.elements.locVerified.checked, updatedAt:new Date().toISOString(), updatedBy:S.user?.email||"" };
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
  $("addBtn").hidden=!S.canWrite;
}

/* events */
$("typeChips").addEventListener("click",e=>{const b=e.target.closest("button"); if(!b) return; S.type=b.dataset.v; try{localStorage.setItem("csr-type",S.type)}catch(e){} render();});
STATES.forEach(s=>$("fState").insertAdjacentHTML("beforeend",`<option>${s}</option>`));
COMPONENTS.forEach(s=>$("fComp").insertAdjacentHTML("beforeend",`<option>${s}</option>`));
$("fState").onchange=e=>{S.state=e.target.value;render();};
$("fComp").onchange=e=>{S.comp=e.target.value;render();};
$("fSearch").oninput=e=>{S.q=e.target.value;render();};
$("pipeLegend").addEventListener("click",e=>{const b=e.target.closest("button"); if(!b) return; S.status = S.status===b.dataset.s ? "" : b.dataset.s; render();});
$("list").addEventListener("click",e=>{const b=e.target.closest(".item"); if(b) select(b.dataset.id,true);});
$("viewPen").onclick=()=>M.fit&&M.fit(PEN);
$("viewAll").onclick=()=>M.fit&&M.fit(ALL);
$("addBtn").onclick=()=>{ S.sel=null; S.editing={ _id:null, type:"Solar Rooftop", status:"Site Visit", component:"Komuniti Lestari", invoice:"Not Received", payment:"Not Paid" }; renderSide(); if(window.innerWidth<960) $("side").scrollIntoView({behavior:"smooth"}); };
$("exportBtn").onclick=()=>{
  if(!window.XLSX){ toast("Export isn’t available right now"); return; }
  const rows=[...S.projects.values()].sort((a,b)=>(a.no||0)-(b.no||0)).map(p=>({"No.":p.no,"Component":p.component,"Project Name":p.name,"Type":p.type,"State":p.state,"Month":p.month,"Application Received Date":p.appDate,"Project Value (RM)":p.value,"Capacity (kWp)":p.kwp,"Streetlight Units":p.units,"Project Status":p.status,"Project Completion Date":p.completionDate,"Invoice Status":p.invoice,"Payment Status":p.payment,"NPOS Payment No.":p.nposNo,"NPOS Payment Date":p.nposDate,"Remarks":p.remarks,"Latitude":p.lat,"Longitude":p.lng,"Exact Location":p.locVerified?"Yes":"No","Google Maps":p.lat!=null?gmaps(p):""}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Masterlist");
  XLSX.writeFile(wb,`CSR Solar Projects ${new Date().toISOString().slice(0,10)}.xlsx`);
};

/* ================= FIREBASE ================= */
const configured = CONFIG.firebase && CONFIG.firebase.projectId;
let db=null, auth=null;
if(CONFIG.title){ $("appTitle").textContent=CONFIG.title; document.title=CONFIG.title; }
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
  ({initializeApp}=a); ({getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged}=b); ({getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, getDoc}=c);
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
async function importSeed(file){
  try{
    const rows=JSON.parse(await file.text());
    if(!Array.isArray(rows)||!rows.every(r=>r&&r.id&&r.data&&r.data.name)) throw new Error("This isn’t a projects file.");
    const b=writeBatch(db); rows.forEach(r=>b.set(doc(db,"projects",r.id),{...r.data,updatedBy:S.user?.email||""})); await b.commit();
    toast(`Imported ${rows.length} projects`);
  }catch(e){ toast(e.code?permMsg(e):(e.message||"Import failed")); }
}
