const KEY = 'batteryWorkCleanV1';
const REAL_HOURLY = 5;
const BATTERY_PAY = 0.20;
const VIRTUAL_HOURS_PER_DAY = 4;

const $ = (id) => document.getElementById(id);
let entries = [];

function todayISO(){ return new Date().toISOString().slice(0,10); }
function money(n){ return Number(n || 0).toLocaleString('el-GR',{style:'currency',currency:'EUR'}); }
function totalHours(e){ return (Number(e.hours)||0) + (Number(e.minutes)||0)/60; }
function fmtHours(h){
  const totalMin = Math.round((Number(h)||0)*60);
  const hr = Math.floor(totalMin/60);
  const min = totalMin%60;
  return `${hr}ω ${min}λ`;
}
function fmtDate(iso){
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function load(){
  try { entries = JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { entries = []; }
}
function saveAll(){ localStorage.setItem(KEY, JSON.stringify(entries)); }
function clearForm(){
  $('editId').value=''; $('formTitle').textContent='Νέα καταχώρηση';
  $('date').value=todayISO(); $('hours').value=''; $('minutes').value=''; $('batteries').value=''; $('note').value='';
  $('cancelBtn').classList.add('hidden');
}
function flash(text){ $('msg').textContent=text; setTimeout(()=> $('msg').textContent='', 2500); }

function renderStats(){
  const days = entries.length;
  const realHours = entries.reduce((s,e)=>s+totalHours(e),0);
  const bat = entries.reduce((s,e)=>s+(Number(e.batteries)||0),0);
  const realPay = realHours*REAL_HOURLY + bat*BATTERY_PAY;
  const virtualHours = days*VIRTUAL_HOURS_PER_DAY;
  const virtualPay = virtualHours*REAL_HOURLY + bat*BATTERY_PAY;
  $('stats').innerHTML = `
    <div class="stat"><div class="icon">📅</div><div class="label">Ημέρες</div><div class="value">${days}</div></div>
    <div class="stat"><div class="icon">⏱️</div><div class="label">Πραγματικές ώρες</div><div class="value">${fmtHours(realHours)}</div></div>
    <div class="stat"><div class="icon">🔋</div><div class="label">Μπαταρίες</div><div class="value">${bat}</div></div>
    <div class="stat"><div class="icon">💶</div><div class="label">Πραγματικό σύνολο</div><div class="value">${money(realPay)}</div></div>
    <div class="stat"><div class="icon">🧮</div><div class="label">Εικονικό 4ωρο</div><div class="value">${money(virtualPay)}</div></div>
    <div class="stat"><div class="icon">🕘</div><div class="label">Εικονικές ώρες</div><div class="value">${fmtHours(virtualHours)}</div></div>`;
}
function renderEntries(){
  const q = $('search').value.toLowerCase().trim();
  const list = entries.slice().sort((a,b)=> b.date.localeCompare(a.date)).filter(e => !q || e.date.includes(q) || (e.note||'').toLowerCase().includes(q));
  if(!list.length){ $('entries').innerHTML='<p class="entryMeta">Δεν υπάρχουν καταχωρήσεις.</p>'; return; }
  $('entries').innerHTML = list.map(e=>{
    const h = totalHours(e), bats=Number(e.batteries)||0;
    const real = h*REAL_HOURLY + bats*BATTERY_PAY;
    const virt = VIRTUAL_HOURS_PER_DAY*REAL_HOURLY + bats*BATTERY_PAY;
    return `<div class="entry">
      <div class="entryTop"><div><div class="entryTitle">${fmtDate(e.date)}</div><div class="entryMeta">${fmtHours(h)} • ${bats} μπαταρίες<br>Πραγματικά: ${money(real)} • Εικονικά: ${money(virt)}${e.note?`<br>📝 ${escapeHtml(e.note)}`:''}</div></div></div>
      <div class="entryActions"><button class="secondary" onclick="editEntry('${e.id}')">✏️ Επεξεργασία</button><button class="danger" onclick="deleteEntry('${e.id}')">🗑️ Διαγραφή</button></div>
    </div>`;
  }).join('');
}
function render(){ renderStats(); renderEntries(); }
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

$('saveBtn').addEventListener('click', ()=>{
  const date = $('date').value || todayISO();
  const hours = Math.max(0, parseInt($('hours').value || '0',10));
  const minutes = Math.max(0, Math.min(59, parseInt($('minutes').value || '0',10)));
  const batteries = Math.max(0, parseInt($('batteries').value || '0',10));
  const note = $('note').value.trim();
  if(hours===0 && minutes===0 && batteries===0){ flash('Γράψε ώρες/λεπτά ή μπαταρίες πρώτα.'); return; }
  const id = $('editId').value || String(Date.now());
  const item = {id,date,hours,minutes,batteries,note};
  const idx = entries.findIndex(e=>e.id===id);
  if(idx>=0) entries[idx]=item; else entries.push(item);
  saveAll(); clearForm(); render(); flash('✅ Αποθηκεύτηκε');
});
$('cancelBtn').addEventListener('click', clearForm);
$('search').addEventListener('input', renderEntries);
$('clearBtn').addEventListener('click', ()=>{ if(confirm('Να διαγραφούν όλα;')){ entries=[]; saveAll(); render(); }});
$('exportBtn').addEventListener('click', ()=>{
  const rows = [['date','hours','minutes','batteries','note']].concat(entries.map(e=>[e.date,e.hours,e.minutes,e.batteries,e.note||'']));
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='battery-work.csv'; a.click();
});
$('themeBtn').addEventListener('click', ()=>{ document.body.classList.toggle('dark'); localStorage.setItem('batteryTheme', document.body.classList.contains('dark')?'dark':'light'); });
window.editEntry = (id)=>{
  const e = entries.find(x=>x.id===id); if(!e) return;
  $('editId').value=e.id; $('formTitle').textContent='Επεξεργασία καταχώρησης'; $('date').value=e.date; $('hours').value=e.hours; $('minutes').value=e.minutes; $('batteries').value=e.batteries; $('note').value=e.note||''; $('cancelBtn').classList.remove('hidden'); scrollTo({top:0,behavior:'smooth'});
};
window.deleteEntry = (id)=>{ if(confirm('Διαγραφή αυτής της καταχώρησης;')){ entries=entries.filter(e=>e.id!==id); saveAll(); render(); }};

if(localStorage.getItem('batteryTheme')==='dark') document.body.classList.add('dark');
$('date').value=todayISO();
load(); render();
if('serviceWorker' in navigator){ navigator.serviceWorker.register('./service-worker.js').catch(()=>{}); }
