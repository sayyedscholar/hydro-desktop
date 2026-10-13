const $ = id => document.getElementById(id);
const CIRC = 2 * Math.PI * 86;
const LABEL = { water: 'Water', tea: 'Tea', herbal: 'Herbal', coffee: 'Coffee', other: 'Other' };

// live countdown to next reminder; main process sends nextAt, we tick locally
let nextAt = null, nextNote = '';
function fmtLeft(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`;
}
function renderNext() {
  const el = $('next');
  if (!nextNote) return; // no state received yet
  if (nextNote === 'wake') {
    el.textContent = 'Next at ' + new Date(nextAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return;
  }
  const left = nextAt - Date.now();
  const label = nextNote === 'wellness' ? 'Break in ' : 'Next in ';
  el.textContent = left <= 1000 ? 'Due now' : label + fmtLeft(left);
}
setInterval(renderNext, 1000);

$('date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

// only overwrite an input if the user is not typing in it
function setVal(id, v) {
  const el = $(id);
  if (document.activeElement !== el && v !== null && v !== undefined) el.value = v;
}

function render(s) {
  const pct = Math.min(1, s.total / s.goal);
  $('fill').style.strokeDashoffset = CIRC * (1 - pct);
  $('fill').classList.toggle('done', s.reached);
  $('amt').textContent = s.total;
  $('goal').textContent = `/ ${s.goal} ml`;
  nextAt = s.nextAt;
  nextNote = s.note;
  renderNext();

  const st = $('status');
  if (s.reached) {
    st.className = 'status d';
    st.textContent = `Limit reached — ${s.total - s.goal} ml over goal`;
  } else {
    st.className = 'status p';
    st.textContent = `Not reached — ${s.remaining} ml remaining`;
  }

  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.type === s.selectedType));

  const parts = Object.keys(LABEL).filter(k => s.byType[k] > 0).map(k => `${LABEL[k]} ${s.byType[k]}`);
  $('bd').textContent = parts.length ? parts.join(' · ') : 'No drinks logged yet';
  $('warn').textContent = s.coffeeWarn ? 'Coffee limit reached (about 4 cups). Switch to water or herbal tea.' : '';

  const a = s.settings;
  setVal('weight', a.weightKg);
  setVal('act', a.activityBump);
  setVal('goalIn', a.goalMl);
  setVal('interval', a.intervalMin);
  setVal('ws', a.wakeStart);
  setVal('we', a.wakeEnd);
  $('auto').checked = !!a.autoStart;

  const list = $('logList');
  if (!s.entries.length) {
    list.innerHTML = '<div class="empty">Nothing logged yet</div>';
  } else {
    list.innerHTML = s.entries.slice(-4).reverse().map(e => {
      const t = new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      return `<div class="le"><span>${t} · ${LABEL[e.type] || 'Water'}</span><span>${e.ml} ml</span></div>`;
    }).join('');
  }
}

document.querySelectorAll('button.add').forEach(b =>
  b.addEventListener('click', () => window.hydro.add(parseInt(b.dataset.ml, 10))));

document.querySelectorAll('.chip').forEach(c =>
  c.addEventListener('click', () => window.hydro.setType(c.dataset.type)));

$('customBtn').addEventListener('click', async () => {
  const n = parseInt($('custom').value, 10);
  if (n > 0 && n < 5000) { await window.hydro.add(n); $('custom').value = ''; }
});
$('undo').addEventListener('click', () => window.hydro.undo());
$('test').addEventListener('click', () => window.hydro.remindNow());

$('calc').addEventListener('click', async () => {
  const w = parseFloat($('weight').value);
  const goal = await window.hydro.calcGoal(w, parseInt($('act').value, 10));
  $('calcMsg').textContent = goal
    ? `Goal set to ${goal} ml (35 ml/kg + activity). Generic heuristic, not medical advice.`
    : 'Enter weight between 30 and 300 kg.';
});

const commit = () => window.hydro.saveSettings({
  goalMl: parseInt($('goalIn').value, 10),
  intervalMin: parseInt($('interval').value, 10),
  wakeStart: parseInt($('ws').value, 10),
  wakeEnd: parseInt($('we').value, 10),
});
['goalIn', 'interval', 'ws', 'we'].forEach(id => $(id).addEventListener('change', commit));
$('auto').addEventListener('change', () => window.hydro.saveSettings({ autoStart: $('auto').checked }));

window.hydro.onState(render);
window.hydro.getState().then(render);
