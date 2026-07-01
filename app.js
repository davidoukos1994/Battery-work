(function(){
  'use strict';
  const VERSION = 'monthly-backup-2.1.0';
  const KEY = 'batteryWork.entries.v1';
  const THEME_KEY = 'batteryWork.theme.v1';
  const SETTINGS = { hourlyRate: 5, batteryRate: 0.2, virtualHoursPerDay: 4 };
  const SYNC_KEY = 'batteryWork.githubSync.v1';
  const $ = (id) => document.getElementById(id);

  const els = {
    form:$('entryForm'), editId:$('editId'), date:$('date'), hours:$('hours'), minutes:$('minutes'), batteries:$('batteries'),
    formTitle:$('formTitle'), cancelEdit:$('cancelEdit'), message:$('message'), entries:$('entries'),
    darkBtn:$('darkBtn'), exportBtn:$('exportBtn'), storageStatus:$('storageStatus'), testStorage:$('testStorage'),
    syncToggle:$('syncToggle'), syncSettings:$('syncSettings'), syncStatus:$('syncStatus'), syncNow:$('syncNow'),
    ghOwner:$('ghOwner'), ghRepo:$('ghRepo'), ghBranch:$('ghBranch'), ghPath:$('ghPath'), ghToken:$('ghToken'), saveSync:$('saveSync'), clearSync:$('clearSync')
  };

  let entries = [];
  let syncConfig = null;
  let syncing = false;

  function today(){
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,10);
  }
  function money(n){return Number(n||0).toLocaleString('el-GR',{style:'currency',currency:'EUR'});}
  function timeText(minutes){
    const h = Math.floor((minutes||0)/60); const m = (minutes||0)%60;
    return `${h}:${String(m).padStart(2,'0')}`;
  }
  function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
  function safeNum(v){const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0;}
  function ym(date){return String(date||'').slice(0,7);}
  function monthName(key){
    const [y,m] = key.split('-').map(Number);
    return new Date(y, m-1, 1).toLocaleDateString('el-GR',{month:'long',year:'numeric'}).replace(/^./, c=>c.toUpperCase());
  }
  function formatDate(iso){
    const [y,m,d] = iso.split('-').map(Number);
    return new Date(y,m-1,d).toLocaleDateString('el-GR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'});
  }
  function calcEntry(e){
    const minutesTotal = Number(e.minutesTotal||0);
    const batteries = Number(e.batteries||0);
    return {
      real:(minutesTotal/60)*SETTINGS.hourlyRate + batteries*SETTINGS.batteryRate,
      virtual:SETTINGS.virtualHoursPerDay*SETTINGS.hourlyRate + batteries*SETTINGS.batteryRate
    };
  }
  function calcTotals(list){
    return list.reduce((s,e)=>{
      const c = calcEntry(e);
      s.days += 1;
      s.minutes += Number(e.minutesTotal||0);
      s.batteries += Number(e.batteries||0);
      s.real += c.real;
      s.virtual += c.virtual;
      if(!s.lastDate || e.date > s.lastDate) s.lastDate = e.date;
      return s;
    }, {days:0, minutes:0, batteries:0, real:0, virtual:0, lastDate:''});
  }

  function normalizeEntry(e){
    const date = e && e.date ? String(e.date).slice(0,10) : today();
    const minutesTotal = Math.max(0, Math.floor(Number(e.minutesTotal || (Number(e.hours||0)*60 + Number(e.minutes||0))) || 0));
    const batteries = Math.max(0, Math.floor(Number(e.batteries) || 0));
    return { id:e.id || uid(), date, minutesTotal, batteries, updatedAt:e.updatedAt || new Date().toISOString() };
  }



  function loadSyncConfig(){
    try{ syncConfig = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); }catch(e){ syncConfig = null; }
    if(syncConfig){
      els.ghOwner.value = syncConfig.owner || '';
      els.ghRepo.value = syncConfig.repo || '';
      els.ghBranch.value = syncConfig.branch || 'main';
      els.ghPath.value = syncConfig.path || 'battery-work-data.json';
      els.ghToken.value = syncConfig.token || '';
    }else{
      els.ghBranch.value = 'main';
      els.ghPath.value = 'battery-work-data.json';
    }
  }
  function syncReady(){ return !!(syncConfig && syncConfig.owner && syncConfig.repo && syncConfig.branch && syncConfig.path && syncConfig.token); }
  function renderSyncStatus(msg){
    if(msg){ els.syncStatus.textContent = msg; return; }
    els.syncStatus.textContent = syncReady() ? '✅ Ο συγχρονισμός GitHub είναι ρυθμισμένος.' : 'Δεν έχει ρυθμιστεί συγχρονισμός.';
  }
  function mergeEntries(localList, remoteList){
    const byDate = new Map();
    [...(localList||[]), ...(remoteList||[])].map(normalizeEntry).forEach(e=>{
      const old = byDate.get(e.date);
      if(!old || String(e.updatedAt||'') >= String(old.updatedAt||'')) byDate.set(e.date, e);
    });
    return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }
  async function githubRequest(method, path, body){
    const url = `https://api.github.com/repos/${encodeURIComponent(syncConfig.owner)}/${encodeURIComponent(syncConfig.repo)}/contents/${syncConfig.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(syncConfig.branch)}`;
    const opts = { method, headers:{ 'Accept':'application/vnd.github+json', 'Authorization':`Bearer ${syncConfig.token}`, 'X-GitHub-Api-Version':'2022-11-28' } };
    if(body){ opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(body); }
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null; try{ data = text ? JSON.parse(text) : null; }catch(e){}
    if(!res.ok) throw new Error((data && data.message) || text || `GitHub error ${res.status}`);
    return data;
  }
  function b64encodeUnicode(str){ return btoa(unescape(encodeURIComponent(str))); }
  function b64decodeUnicode(str){ return decodeURIComponent(escape(atob(String(str||'').replace(/\n/g,'')))); }
  async function syncWithGithub(silent){
    if(!syncReady()){ if(!silent) show('Πρώτα βάλε τις ρυθμίσεις GitHub.'); renderSyncStatus(); return; }
    if(syncing) return;
    syncing = true; renderSyncStatus('🔄 Γίνεται συγχρονισμός...');
    try{
      let sha = null, remoteEntries = [];
      try{
        const file = await githubRequest('GET');
        sha = file.sha;
        const parsed = JSON.parse(b64decodeUnicode(file.content || ''));
        remoteEntries = Array.isArray(parsed) ? parsed : (parsed.entries || []);
      }catch(e){
        if(!String(e.message||'').includes('Not Found')) throw e;
      }
      entries = mergeEntries(entries, remoteEntries);
      saveLocalOnly();
      const payload = { app:'Battery Work', version:VERSION, updatedAt:new Date().toISOString(), settings:SETTINGS, entries };
      const body = { message:`Battery Work sync ${today()}`, content:b64encodeUnicode(JSON.stringify(payload,null,2)), branch:syncConfig.branch };
      if(sha) body.sha = sha;
      await githubRequest('PUT', null, body);
      render();
      renderSyncStatus(`✅ Συγχρονίστηκε: ${entries.length} καταχωρήσεις.`);
      if(!silent) show('✅ Ο συγχρονισμός ολοκληρώθηκε.');
    }catch(err){
      console.error(err);
      renderSyncStatus('❌ Πρόβλημα συγχρονισμού. Έλεγξε token/repo/branch.');
      if(!silent) show('❌ Δεν έγινε συγχρονισμός.');
    }finally{ syncing = false; }
  }
  function saveLocalOnly(){
    localStorage.setItem(KEY, JSON.stringify(entries));
    localStorage.setItem('batteryWork.lastSaved.v1', new Date().toISOString());
  }

  function canUseLocalStorage(){
    try{ const k='batteryWork.test'; localStorage.setItem(k, 'ok'); const ok = localStorage.getItem(k)==='ok'; localStorage.removeItem(k); return ok; }
    catch(e){ return false; }
  }

  function load(){
    try{
      entries = JSON.parse(localStorage.getItem(KEY) || '[]');
      if(!Array.isArray(entries)) entries = [];
      entries = entries.map(normalizeEntry).filter(e=>e.date);
    }catch(e){ entries = []; }
  }
  function save(){
    saveLocalOnly();
    if(syncReady()) syncWithGithub(true);
  }
  function renderStorage(){
    els.storageStatus.textContent = canUseLocalStorage() ? `✅ Η αποθήκευση δουλεύει (${VERSION})` : '❌ Η αποθήκευση είναι μπλοκαρισμένη';
  }
  function renderTotals(){ /* Το πάνω πλαίσιο με τα σύνολα αφαιρέθηκε στην έκδοση 2.1.0. */ }
  function renderEntries(){
    if(!entries.length){ els.entries.innerHTML = '<p class="hint">Δεν έχεις ακόμα καταχωρήσεις.</p>'; return; }
    const groups = new Map();
    [...entries].sort((a,b)=>b.date.localeCompare(a.date)).forEach(e=>{
      const key = ym(e.date);
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    });
    els.entries.innerHTML = [...groups.entries()].map(([key, list])=>{
      const t = calcTotals(list);
      const days = list.map(e=>{
        const c = calcEntry(e);
        return `<article class="entry day-entry">
          <div class="entry-top"><div class="entry-date">${formatDate(e.date)}</div><strong>${money(c.real)}</strong></div>
          <p>${timeText(e.minutesTotal)} ώρες • ${e.batteries} μπαταρίες • Εικονικά: ${money(c.virtual)}</p>
          <div class="entry-actions">
            <button class="edit" data-edit="${e.id}" type="button">✏️ Επεξεργασία</button>
            <button class="delete" data-delete="${e.id}" type="button">🗑️ Διαγραφή</button>
          </div>
        </article>`;
      }).join('');
      return `<article class="month-card">
        <div class="month-head">
          <div><h3>${monthName(key)}</h3><p>Τελευταία αποθήκευση μήνα: ${formatDate(t.lastDate)}</p></div>
          <span class="month-badge">${t.days} μέρες</span>
        </div>
        <div class="month-grid">
          <div><span>Πραγματικά σύνολο</span><strong>${money(t.real)}</strong></div>
          <div><span>Εικονικά σύνολο</span><strong>${money(t.virtual)}</strong></div>
          <div><span>Ώρες</span><strong>${timeText(t.minutes)}</strong></div>
          <div><span>Μπαταρίες</span><strong>${t.batteries}</strong></div>
        </div>
        <details class="month-details"><summary>Δες τις μέρες του μήνα</summary>${days}</details>
      </article>`;
    }).join('');
  }
  function render(){ renderEntries(); renderStorage(); renderSyncStatus(); }
  function resetForm(){
    els.editId.value=''; els.formTitle.textContent='Νέα καταχώρηση'; els.cancelEdit.classList.add('hidden');
    els.date.value=today(); els.hours.value=''; els.minutes.value=''; els.batteries.value='';
  }
  function show(msg){ els.message.textContent=msg; setTimeout(()=>{ if(els.message.textContent===msg) els.message.textContent=''; },2600); }

  function exportBackup(){
    const monthly = {};
    entries.forEach(e=>{
      const key = ym(e.date); if(!monthly[key]) monthly[key] = { name:monthName(key), entries:[], totals:null };
      monthly[key].entries.push(e);
    });
    Object.keys(monthly).forEach(k=>{ monthly[k].totals = calcTotals(monthly[k].entries); });
    const data = { app:'Battery Work', version:VERSION, exportedAt:new Date().toISOString(), settings:SETTINGS, entries, monthly };
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a = document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`battery-work-backup-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    show('✅ Το backup κατέβηκε με όλες τις μέρες και τα μηνιαία σύνολα.');
  }

  function importBackup(){
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json,.json';
    input.addEventListener('change', ()=>{
      const file = input.files && input.files[0]; if(!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        try{
          const data = JSON.parse(reader.result);
          const incoming = Array.isArray(data) ? data : data.entries;
          if(!Array.isArray(incoming)) throw new Error('no entries');
          const byKey = new Map(entries.map(e=>[e.date, e]));
          incoming.map(normalizeEntry).forEach(e=>byKey.set(e.date, e));
          entries = [...byKey.values()].sort((a,b)=>a.date.localeCompare(b.date));
          save(); render(); show('✅ Έγινε επαναφορά backup.');
        }catch(err){ show('❌ Το αρχείο backup δεν διαβάζεται.'); }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  els.form.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    const h = Math.floor(safeNum(els.hours.value));
    const m = Math.floor(safeNum(els.minutes.value));
    const b = Math.floor(safeNum(els.batteries.value));
    if(!els.date.value){ show('Βάλε ημερομηνία.'); return; }
    if(h===0 && m===0 && b===0){ show('Γράψε ώρες/λεπτά ή μπαταρίες.'); return; }
    const item = { id: els.editId.value || uid(), date: els.date.value, minutesTotal: h*60 + Math.min(m,59), batteries: b, updatedAt: new Date().toISOString() };
    const idx = entries.findIndex(e=>e.id===item.id || e.date===item.date);
    if(idx>=0) entries[idx]=Object.assign({}, entries[idx], item); else entries.push(item);
    save(); render(); resetForm(); show(`✅ Αποθηκεύτηκε στον μήνα ${monthName(ym(item.date))}.`);
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
    if(confirm('Πάτα OK για εξαγωγή backup. Πάτα Άκυρο για επαναφορά/import backup.')) exportBackup();
    else importBackup();
  });
  els.testStorage.addEventListener('click', ()=>{ renderStorage(); show(canUseLocalStorage() ? '✅ Η αποθήκευση δουλεύει.' : '❌ Δεν δουλεύει η αποθήκευση.'); });
  els.syncToggle.addEventListener('click', ()=> els.syncSettings.classList.toggle('hidden'));
  els.saveSync.addEventListener('click', ()=>{
    syncConfig = {
      owner: els.ghOwner.value.trim(), repo: els.ghRepo.value.trim(), branch: els.ghBranch.value.trim() || 'main',
      path: els.ghPath.value.trim() || 'battery-work-data.json', token: els.ghToken.value.trim()
    };
    localStorage.setItem(SYNC_KEY, JSON.stringify(syncConfig));
    renderSyncStatus(); show('✅ Αποθηκεύτηκαν οι ρυθμίσεις συγχρονισμού.'); syncWithGithub(true);
  });
  els.clearSync.addEventListener('click', ()=>{
    if(!confirm('Να καθαριστούν οι ρυθμίσεις συγχρονισμού από αυτή τη συσκευή;')) return;
    localStorage.removeItem(SYNC_KEY); syncConfig = null; els.ghOwner.value=''; els.ghRepo.value=''; els.ghToken.value=''; els.ghBranch.value='main'; els.ghPath.value='battery-work-data.json'; renderSyncStatus();
  });
  els.syncNow.addEventListener('click', ()=> syncWithGithub(false));


  loadSyncConfig();
  if(localStorage.getItem(THEME_KEY)==='dark') document.documentElement.classList.add('dark');
  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistrations?.().then(regs=>regs.forEach(r=>r.unregister())).catch(()=>{});
  }
  load(); resetForm(); render(); if(syncReady()) syncWithGithub(true);
})();
