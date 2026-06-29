const STORAGE_KEY = 'battery-work-tracker-pro-v2';
const SETTINGS_KEY = 'battery-work-tracker-settings-v2';
const HOURLY_RATE = 5;
const BATTERY_RATE = 0.2;
const VIRTUAL_HOURS_PER_DAY = 4;

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(n || 0);
const number = (n) => new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 }).format(n || 0);

let entries = loadEntries();
let deferredInstallPrompt = null;

const form = $('entryForm');
const dateInput = $('dateInput');
const hoursInput = $('hoursInput');
const batteriesInput = $('batteriesInput');
const noteInput = $('noteInput');
const entryId = $('entryId');
const monthFilter = $('monthFilter');
const yearFilter = $('yearFilter');
const searchInput = $('searchInput');

dateInput.value = new Date().toISOString().slice(0, 10);
restoreTheme();
render();
registerPwa();

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const payload = {
    id: entryId.value || makeId(),
    date: dateInput.value,
    hours: parseFloat(String(hoursInput.value).replace(',', '.')) || 0,
    batteries: parseInt(batteriesInput.value, 10) || 0,
    note: noteInput.value.trim(),
    updatedAt: new Date().toISOString()
  };
  if (!payload.date) { alert('Βάλε ημερομηνία.'); return; }
  if (payload.hours < 0 || payload.batteries < 0) { alert('Οι ώρες και οι μπαταρίες δεν μπορούν να είναι αρνητικές.'); return; }
  const existingIndex = entries.findIndex((entry) => entry.id === payload.id);
  if (existingIndex >= 0) entries[existingIndex] = payload;
  else entries.push(payload);
  saveEntries();
  resetForm();
  render();
  alert('Η καταχώρηση αποθηκεύτηκε ✅');
});

$('resetFormBtn').addEventListener('click', resetForm);
$('themeToggle').addEventListener('click', toggleTheme);
$('clearAllBtn').addEventListener('click', () => {
  if (!entries.length) return;
  if (confirm('Σίγουρα θέλεις να διαγραφούν όλες οι καταχωρήσεις;')) {
    entries = [];
    saveEntries();
    render();
  }
});
$('exportExcelBtn').addEventListener('click', exportExcel);
$('exportPdfBtn').addEventListener('click', () => window.print());
monthFilter.addEventListener('change', render);
yearFilter.addEventListener('change', render);
searchInput.addEventListener('input', render);

function loadEntries() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveEntries() { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
function makeId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
function calcRealPay(entry) { return (entry.hours * HOURLY_RATE) + (entry.batteries * BATTERY_RATE); }
function calcVirtualPay(entry) { return (VIRTUAL_HOURS_PER_DAY * HOURLY_RATE) + (entry.batteries * BATTERY_RATE); }
function sortedEntries() { return [...entries].sort((a, b) => b.date.localeCompare(a.date)); }
function filteredEntries() {
  const month = monthFilter.value;
  const year = yearFilter.value;
  const q = searchInput.value.trim().toLowerCase();
  return sortedEntries().filter((entry) => {
    const d = new Date(entry.date + 'T00:00:00');
    const monthOk = month === 'all' || String(d.getMonth() + 1) === month;
    const yearOk = year === 'all' || String(d.getFullYear()) === year;
    const qOk = !q || entry.date.includes(q) || (entry.note || '').toLowerCase().includes(q);
    return monthOk && yearOk && qOk;
  });
}
function render() {
  updateFilters();
  const visible = filteredEntries();
  renderSummary(visible);
  renderTable(visible);
  renderChart();
}
function updateFilters() {
  const currentMonth = monthFilter.value || 'all';
  const currentYear = yearFilter.value || 'all';
  const months = new Set(entries.map((entry) => String(new Date(entry.date + 'T00:00:00').getMonth() + 1)));
  const years = new Set(entries.map((entry) => String(new Date(entry.date + 'T00:00:00').getFullYear())));
  monthFilter.innerHTML = '<option value="all">Όλοι</option>' + [...months].sort((a,b) => Number(a)-Number(b)).map((m) => `<option value="${m}">${monthName(m)}</option>`).join('');
  yearFilter.innerHTML = '<option value="all">Όλα</option>' + [...years].sort((a,b) => Number(b)-Number(a)).map((y) => `<option value="${y}">${y}</option>`).join('');
  monthFilter.value = [...months].has(currentMonth) ? currentMonth : 'all';
  yearFilter.value = [...years].has(currentYear) ? currentYear : 'all';
}
function monthName(monthNumber) {
  return new Date(2026, Number(monthNumber) - 1, 1).toLocaleDateString('el-GR', { month: 'long' });
}
function renderSummary(list) {
  const totals = list.reduce((acc, entry) => {
    acc.days += 1; acc.hours += entry.hours; acc.batteries += entry.batteries;
    acc.real += calcRealPay(entry); acc.virtual += calcVirtualPay(entry);
    return acc;
  }, { days: 0, hours: 0, batteries: 0, real: 0, virtual: 0 });
  $('totalDays').textContent = totals.days;
  $('totalHours').textContent = number(totals.hours);
  $('totalBatteries').textContent = number(totals.batteries);
  $('realPay').textContent = money(totals.real);
  $('virtualPay').textContent = money(totals.virtual);
  $('virtualHours').textContent = number(totals.days * VIRTUAL_HOURS_PER_DAY);
}
function renderTable(list) {
  $('emptyState').classList.toggle('hidden', list.length > 0);
  $('entriesTable').innerHTML = list.map((entry) => `
    <tr>
      <td>${formatDate(entry.date)}</td>
      <td>${number(entry.hours)}</td>
      <td>${number(entry.batteries)}</td>
      <td>${money(calcRealPay(entry))}</td>
      <td>${money(calcVirtualPay(entry))}</td>
      <td>${escapeHtml(entry.note || '-')}</td>
      <td><div class="row-actions"><button class="ghost-btn" onclick="editEntry('${entry.id}')">✏️</button><button class="danger-btn" onclick="deleteEntry('${entry.id}')">🗑️</button></div></td>
    </tr>`).join('');
}
function renderChart() {
  const canvas = $('monthlyChart');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const months = {};
  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    months[key] ||= { real: 0, virtual: 0 };
    months[key].real += calcRealPay(entry);
    months[key].virtual += calcVirtualPay(entry);
  }
  const data = Object.entries(months).sort().slice(-8);
  if (!data.length) { ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted'); ctx.font = '22px sans-serif'; ctx.fillText('Δεν υπάρχουν δεδομένα για γράφημα.', 32, 150); return; }
  const max = Math.max(...data.flatMap(([,v]) => [v.real, v.virtual]), 1);
  const w = canvas.width, h = canvas.height, pad = 45, gap = 18;
  const groupW = (w - pad * 2) / data.length;
  ctx.font = '14px sans-serif';
  data.forEach(([key, value], i) => {
    const x = pad + i * groupW + gap;
    const realH = (value.real / max) * (h - pad * 2);
    const virtualH = (value.virtual / max) * (h - pad * 2);
    ctx.fillStyle = '#22c55e'; ctx.fillRect(x, h - pad - realH, groupW / 3, realH);
    ctx.fillStyle = '#a855f7'; ctx.fillRect(x + groupW / 3 + 4, h - pad - virtualH, groupW / 3, virtualH);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted'); ctx.fillText(key, x, h - 16);
  });
  ctx.fillStyle = '#22c55e'; ctx.fillText('Πραγματικά', pad, 18);
  ctx.fillStyle = '#a855f7'; ctx.fillText('Εικονικά', pad + 100, 18);
}
function editEntry(id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) return;
  entryId.value = entry.id; dateInput.value = entry.date; hoursInput.value = entry.hours; batteriesInput.value = entry.batteries; noteInput.value = entry.note || '';
  $('formTitle').textContent = 'Επεξεργασία καταχώρησης'; $('resetFormBtn').classList.remove('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function deleteEntry(id) {
  if (!confirm('Να διαγραφεί αυτή η καταχώρηση;')) return;
  entries = entries.filter((entry) => entry.id !== id);
  saveEntries(); render();
}
function resetForm() {
  form.reset(); entryId.value = ''; dateInput.value = new Date().toISOString().slice(0, 10);
  $('formTitle').textContent = 'Νέα καταχώρηση'; $('resetFormBtn').classList.add('hidden');
}
function exportExcel() {
  const rows = filteredEntries();
  const html = `<table><tr><th>Ημερομηνία</th><th>Ώρες</th><th>Μπαταρίες</th><th>Πραγματικό σύνολο</th><th>Εικονικό 4ωρο</th><th>Σημείωση</th></tr>${rows.map(e => `<tr><td>${formatDate(e.date)}</td><td>${e.hours}</td><td>${e.batteries}</td><td>${calcRealPay(e).toFixed(2)}</td><td>${calcVirtualPay(e).toFixed(2)}</td><td>${escapeHtml(e.note || '')}</td></tr>`).join('')}</table>`;
  downloadFile('battery-work-tracker.xls', 'application/vnd.ms-excel', '\ufeff' + html);
}
function downloadFile(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function formatDate(date) { return new Date(date + 'T00:00:00').toLocaleDateString('el-GR'); }
function escapeHtml(text) { return String(text).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function toggleTheme() {
  document.body.classList.toggle('dark');
  const dark = document.body.classList.contains('dark');
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ dark }));
  $('themeToggle').textContent = dark ? '☀️ Light' : '🌙 Dark';
  renderChart();
}
function restoreTheme() {
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  if (settings.dark) document.body.classList.add('dark');
  $('themeToggle').textContent = settings.dark ? '☀️ Light' : '🌙 Dark';
}
function registerPwa() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; $('installBtn').classList.remove('hidden'); });
  $('installBtn').addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); deferredInstallPrompt = null; $('installBtn').classList.add('hidden'); });
}
window.editEntry = editEntry;
window.deleteEntry = deleteEntry;
