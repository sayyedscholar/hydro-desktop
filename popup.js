const $ = id => document.getElementById(id);

function render(s) {
  const well = s.mode === 'wellness';
  $('title').textContent = well ? 'Take a quick break' : 'Time to drink water';
  $('tip').textContent = s.tip || '';

  document.querySelectorAll('.drink-only').forEach(el => { el.style.display = well ? 'none' : ''; });
  $('drinkRow').style.display = well ? 'none' : 'flex';
  $('wellRow').style.display = well ? 'flex' : 'none';

  const pct = Math.min(100, Math.round((s.total / s.goal) * 100));
  $('fill').style.width = pct + '%';
  $('fill').classList.toggle('done', s.reached);
  $('sub').textContent = well
    ? 'Goal reached today. Keep it up.'
    : s.reached
      ? 'Goal reached — nice.'
      : `Remaining: ${s.remaining} ml to reach today's goal`;
  $('prog').textContent = `${s.total} / ${s.goal} ml (${pct}%)`;
  $('warn').textContent = s.coffeeWarn ? 'Coffee limit reached (about 4 cups). Switch to water or herbal tea.' : '';

  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.type === s.selectedType));
}

document.querySelectorAll('button[data-ml]').forEach(btn => {
  btn.addEventListener('click', async () => {
    await window.hydro.add(parseInt(btn.dataset.ml, 10));
    window.hydro.closePopup();
  });
});
document.querySelectorAll('.chip').forEach(c =>
  c.addEventListener('click', () => window.hydro.setType(c.dataset.type)));

$('snooze').addEventListener('click', () => window.hydro.snooze(15));
$('snooze2').addEventListener('click', () => window.hydro.snooze(15));
$('okay').addEventListener('click', () => window.hydro.closePopup());
$('close').addEventListener('click', () => window.hydro.closePopup());

window.hydro.onState(render);
window.hydro.getState().then(render);
