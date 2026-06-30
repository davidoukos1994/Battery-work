(function(){
  'use strict';
  const VERSION = 'storage-fix-1.0.0';
  const KEY = 'batteryWork.entries.v1';
  const THEME_KEY = 'batteryWork.theme.v1';
  const SETTINGS = { hourlyRate: 5, batteryRate: 0.2, virtualHoursPerDay: 4 };
  const $ = (id) => document.getElementById(id);

  const els = {
    form:$('entryForm'), editId:$('editId'), date:$('date'), hours:$('hours'), minutes:$('minutes'), batteries:$('batteries'),
    formTitle:$('formTitle'), cancelEdit:$('cancelEdit'), message:$('message'), entries:$('entries'),
    totalDays:$('totalDays'), totalTime:$('totalTime'), totalBatteries:$('totalBatteries'), realTotal:$('realTotal'), virtualTotal:$('virtualTotal'),
    darkBtn:$('darkBtn'), exportBtn:$('exportBtn'), storageStatus:$('storageStatus'), testStorage:$('testStorage')
  };

  let entries = [];

  function today(){
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,10);
  }
  function money(n){return Number(n||0).toLocaleString('el-GR',{style:'currency',currency:'EUR'});}
  function timeText(minutes){
    const h = Math.floor(minutes/60); const m = minutes%60;
    return `${h}:${String(m).padStart(2,'0')}`;
  }
  function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
  function safeNum(v){const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0;}

  function canUseLocalStorage(){
    try{ const k='batteryWork.test'; localStorage.setItem(k, 'ok'); return localStorage.getItem(k)==='ok'; }
    catch(e){ return false; }
  }

  function load(){
    try{
      entries = JSON.parse(localStorage.getItem(KEY) || '[]');
      if(!Array.isArray(entries)) entries = [];
    }catch(e){ entries = []; }
  }
  function save(){
    localStorage.setItem(KEY, JSON.stringify(entries));
    localStorage.setItem('batteryWork.lastSaved.v1', new Date().toISOString());
  }
  function renderStorage(){
    els.storageStatus.textContent = canUseLocalStorage() ? `✅ Η αποθήκευση δουλεύει (${VERSION})` : '❌ Η αποθήκευση είναι μπλοκαρισμένη';
  }
  function totals(){
    const totalMinutes = entries.reduce((s,e)=>s+e.minutesTotal,0);
    const batteries = entries.reduce((s,e)=>s+e.batteries,0);
    const real = entries.reduce((s,e)=>s+(e.minutesTotal/60)*SETTINGS.hourlyRate + e.batteries*SETTINGS.batteryRate,0);
    const virtual = entries.reduce((s,e)=>s+SETTINGS.virtualHoursPerDay*SETTINGS.hourlyRate + e.batteries*SETTINGS.batteryRate,0);
    els.totalDays.textContent = entries.length;
    els.totalTime.textContent = timeText(totalMinutes);
    els.totalBatteries.textContent = batteries;
    els.realTotal.textContent = money(real);
    els.virtualTotal.textContent = money(virtual);
  }
  function formatDate(iso){
    const [y,m,d] = iso.split('-').map(Number);
    return new Date(y,m-1,d).toLocaleDateString('el-GR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'});
  }
  function renderEntries(){
    const sorted = [...entries].sort((a,b)=>b.date.localeCompare(a.date));
    if(!sorted.length){ els.entries.innerHTML = '<p class="hint">Δεν έχεις ακόμα καταχωρήσεις.</p>'; return; }
    els.entries.innerHTML = sorted.map(e=>{
      const real = (e.minutesTotal/60)*SETTINGS.hourlyRate + e.batteries*SETTINGS.batteryRate;
      const virt = SETTINGS.virtualHoursPerDay*SETTINGS.hourlyRate + e.batteries*SETTINGS.batteryRate;
      return `<article class="entry">
        <div class="entry-top"><div class="entry-date">${formatDate(e.date)}</div><strong>${money(real)}</strong></div>
        <p>${timeText(e.minutesTotal)} ώρες • ${e.batteries} μπαταρίες • Εικονικά: ${money(virt)}</p>
        <div class="entry-actions">
          <button class="edit" data-edit="${e.id}" type="button">✏️ Επεξεργασία</button>
          <button class="delete" data-delete="${e.id}" type="button">🗑️ Διαγραφή</button>
        </div>
      </article>`;
    }).join('');
  }
  function render(){ totals(); renderEntries(); renderStorage(); }
  function resetForm(){
    els.editId.value=''; els.formTitle.textContent='Νέα καταχώρηση'; els.cancelEdit.classList.add('hidden');
    els.date.value=today(); els.hours.value=''; els.minutes.value=''; els.batteries.value='';
  }
  function show(msg){ els.message.textContent=msg; setTimeout(()=>{ if(els.message.textContent===msg) els.message.textContent=''; },2200); }

  els.form.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    const h = Math.floor(safeNum(els.hours.value));
    const m = Math.floor(safeNum(els.minutes.value));
    const b = Math.floor(safeNum(els.batteries.value));
    if(!els.date.value){ show('Βάλε ημερομηνία.'); return; }
    if(h===0 && m===0 && b===0){ show('Γράψε ώρες/λεπτά ή μπαταρίες.'); return; }
    const item = { id: els.editId.value || uid(), date: els.date.value, minutesTotal: h*60 + Math.min(m,59), batteries: b, updatedAt: new Date().toISOString() };
    const idx = entries.findIndex(e=>e.id===item.id);
    if(idx>=0) entries[idx]=item; else entries.push(item);
    save(); render(); resetForm(); show('✅ Αποθηκεύτηκε σωστά.');
  });

  els.entries.addEventListener('click', (ev)=>{
    const editId = ev.target.dataset.edit;
    const delId = ev.target.dataset.delete;
    if(editId){
      const e = entries.find(x=>x.id===editId); if(!e) return;
      els.editId.value=e.id; els.date.value=e.date; els.hours.value=Math.floor(e.minutesTotal/60); els.minutes.value=e.minutesTotal%60; els.batteries.value=e.batteries;
      els.formTitle.textContent='Επεξεργασία καταχώρησης'; els.cancelEdit.classList.remove('hidden'); window.scrollTo({top:0,behavior:'smooth'});
    }
    if(delId && confirm('Να διαγραφεί αυτή η καταχώρηση;')){
      entries = entries.filter(e=>e.id!==delId); save(); render(); show('Διαγράφηκε.');
    }
  });
  els.cancelEdit.addEventListener('click', resetForm);
  els.darkBtn.addEventListener('click', ()=>{
    document.documentElement.classList.toggle('dark');
    localStorage.setItem(THEME_KEY, document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  });
  els.exportBtn.addEventListener('click', ()=>{
    const data = { app:'Battery Work', version:VERSION, exportedAt:new Date().toISOString(), entries };
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='battery-work-backup.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  els.testStorage.addEventListener('click', ()=>{ renderStorage(); show(canUseLocalStorage() ? '✅ Η αποθήκευση δουλεύει.' : '❌ Δεν δουλεύει η αποθήκευση.'); });

  if(localStorage.getItem(THEME_KEY)==='dark') document.documentElement.classList.add('dark');
  if('serviceWorker' in navigator){
    // Δεν κάνουμε cache με service worker για να μη μένει παλιά έκδοση στο iPhone.
    navigator.serviceWorker.getRegistrations?.().then(regs=>regs.forEach(r=>r.unregister())).catch(()=>{});
  }
  load(); resetForm(); render();
})();
