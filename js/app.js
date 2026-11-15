// Interfaz paso a paso. Toda la lógica de cálculo está en engine.js
// y usa los valores del Excel (defaultModel).
import { CATS, CERTS, compute, defaultModel, siteContext } from './engine.js';

const S = { data: null, grid: null, model: null, input: null, result: null, step: 1, map: null, marker: null, reqCert: null };
const $ = sel => document.querySelector(sel);
const LS_INPUT = 'tfm-cert-input-v1';
const LS_THEME = 'tfm-theme';
const STEPS = { 1: 'Ubicación', 2: 'Proyecto', 3: 'Promotor', 4: 'Resultado' };

const CRITERIA = ['coincidencia', 'cobertura', 'alineacion', 'viabilidad', 'incentivos', 'inversion', 'exigencia'];
const CRIT_PLAIN = {
  coincidencia: 'coincidencia con las prioridades del sitio',
  cobertura: 'cobertura de las categorías del sitio',
  alineacion: 'alineación con la normativa mexicana',
  viabilidad: 'viabilidad económica',
  incentivos: 'incentivos y mercado local',
  inversion: 'inversión y reconocimiento internacional',
  exigencia: 'exigencia técnica',
};
const OBJECTIVE_HELP = {
  'Mercado local (base)': 'Vender o rentar en México: equilibrio entre costo, incentivos locales y desempeño.',
  'Inversión extranjera / fondos internacionales': 'Atraer capital de fondos internacionales.',
  'Inversión europea (fondos UE / Reino Unido)': 'Fondos de la Unión Europea o del Reino Unido, donde BREEAM es la referencia.',
  'Reconocimiento internacional / marca premium': 'Posicionar el proyecto como producto premium con un sello reconocido en todo el mundo.',
  'Máximo desempeño ambiental': 'Lograr el mejor resultado ambiental para el sitio.',
  'Mínimo coste y financiamiento local': 'Certificar al menor costo y acceder a créditos verdes mexicanos (Infonavit, EcoCasa, SHF).',
  'Personalizado': 'Todos los criterios pesan casi lo mismo.',
};
const SHORT = { LEED: 'LEED', BREEAM: 'BREEAM', EDGE: 'EDGE' };

// ---------- utilidades ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = d => new Intl.NumberFormat('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt = (n, d = 2) => (n == null || Number.isNaN(n) ? '—' : nf(d).format(n));
const pct = (n, d = 1) => (n == null || Number.isNaN(n) ? '—' : nf(d).format(n * 100) + ' %');
const usd = n => (n == null || n === '' || Number.isNaN(n) ? '—' : 'US$ ' + nf(0).format(n));
const multiline = s => esc(s).replace(/\n/g, '<br>');
const lowerFirst = s => (s ? s[0].toLowerCase() + s.slice(1) : s);
const catName = c => String(c || '').toLowerCase();
const listJoin = arr => (arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1]);
const parseMoney = s => { const d = String(s).replace(/[^\d.]/g, ''); return d === '' ? '' : Number(d); };
const showMoney = v => (v === '' || v == null ? '' : nf(0).format(v));
function showNum(v) {
  if (typeof v !== 'number') return v ?? '';
  if (v > 0 && v < 1 && Math.abs(1 / v - Math.round(1 / v)) < 1e-9) return `1/${Math.round(1 / v)}`;
  return String(+v.toFixed(4));
}
function load(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }
const cityLabel = c => `${c.name}, ${c.state}`;

// ---------- tema ----------
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const b = $('#theme-toggle');
  b.textContent = t === 'dark' ? 'Modo claro' : 'Modo oscuro';
  b.setAttribute('aria-pressed', String(t === 'dark'));
}

// ---------- arranque ----------
async function init() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [data, grid] = await Promise.all([
    fetch('data/base.json').then(r => r.json()),
    fetch('data/grid.json').then(r => r.json()),
  ]);
  S.data = data; S.grid = grid;
  S.model = defaultModel(data);
  S.input = sanitizeInput(load(LS_INPUT), data);
  $('#src-file').textContent = data.source;

  $('#in-typology').innerHTML = data.typologies.map(v => `<option>${esc(v)}</option>`).join('');
  $('#city-list').innerHTML = [...data.cities].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map(c => `<option value="${esc(cityLabel(c))}"></option>`).join('');
  renderObjectives();
  writeInputs();
  bind();
  $('#loading').remove();
  $('#app').hidden = false;
  const fromHash = Number((location.hash.match(/paso-(\d)/) || [])[1]);
  goTo(fromHash >= 1 && fromHash <= 4 ? fromHash : 1, true);
}

// Valores guardados que ya no existen (p. ej. tras actualizar el Excel) se descartan.
function sanitizeInput(saved, data) {
  const i = { ...data.example, ...(saved && typeof saved === 'object' ? saved : {}) };
  if (!data.typologies.includes(i.typology)) i.typology = data.example.typology;
  if (!data.objectives.includes(i.objective)) i.objective = data.example.objective;
  if (!['Sí', 'No'].includes(i.usgbc)) i.usgbc = data.example.usgbc;
  return i;
}

function renderObjectives() {
  const cwAll = S.model.params.criteriaWeights;
  $('#in-objective').innerHTML = S.data.objectives.map((o, i) => {
    const cw = cwAll[o];
    const top = CRITERIA.filter(k => cw[k] > 0).sort((a, b) => cw[b] - cw[a]).slice(0, 3);
    return `<label class="choice"><input type="radio" name="objective" value="${esc(o)}" id="obj-${i}">
      <span><strong>${esc(o)}</strong>
      <span class="help">${esc(OBJECTIVE_HELP[o] || '')} Pesa más: ${esc(listJoin(top.map(k => `${CRIT_PLAIN[k]} (${pct(cw[k], 0)})`)))}.</span></span></label>`;
  }).join('');
}

function writeInputs() {
  const i = S.input;
  $('#in-lat').value = i.lat; $('#in-lon').value = i.lon;
  $('#in-typology').value = i.typology; $('#in-area').value = i.area; $('#in-units').value = i.units;
  document.querySelectorAll('input[name="usgbc"]').forEach(r => { r.checked = r.value === i.usgbc; });
  document.querySelectorAll('input[name="objective"]').forEach(r => { r.checked = r.value === i.objective; });
  $('#in-budget').value = showMoney(i.budget);
  $('#in-city-search').value = '';
}

function readInputs() {
  S.input = {
    lat: Number($('#in-lat').value), lon: Number($('#in-lon').value),
    typology: $('#in-typology').value, area: Number($('#in-area').value), units: Number($('#in-units').value),
    usgbc: (document.querySelector('input[name="usgbc"]:checked') || {}).value || 'Sí',
    budget: parseMoney($('#in-budget').value),
    objective: (document.querySelector('input[name="objective"]:checked') || {}).value || S.data.example.objective,
  };
  save(LS_INPUT, S.input);
}

// ---------- validación por paso ----------
function stepErrors(step) {
  const i = S.input, e = [];
  if (step === 1) {
    if (!(i.lat >= 14 && i.lat <= 33) || !(i.lon >= -119 && i.lon <= -86)) e.push('Elige una ubicación en el mapa o busca una ciudad (latitud entre 14 y 33, longitud entre −119 y −86).');
    else if (siteContext(i.lat, i.lon, S.data, S.grid).outside) e.push('El punto cae fuera de México o en el mar. Muévelo a tierra firme.');
  }
  if (step === 2) {
    if (!(i.area > 0)) e.push('Escribe la superficie construida en m².');
    if (!(i.units >= 0) || !Number.isInteger(i.units)) e.push('Escribe el número de departamentos (0 si no hay).');
  }
  if (step === 3 && !S.data.objectives.includes(i.objective)) e.push('Elige un objetivo del promotor.');
  return e;
}
const firstInvalid = () => [1, 2, 3].find(s => stepErrors(s).length) || null;

// ---------- navegación ----------
function goTo(step, initial = false) {
  readInputs();
  if (step === 4 || (!initial && step > S.step)) {
    const bad = [1, 2, 3].filter(s => s < step).find(s => stepErrors(s).length);
    if (bad) {
      if (bad !== S.step) showStep(bad);
      $('#step-errors').innerHTML = stepErrors(bad).map(esc).join('<br>');
      return;
    }
  }
  showStep(step);
}

function showStep(step) {
  S.step = step;
  $('#step-errors').innerHTML = '';
  document.querySelectorAll('.step').forEach(s => { s.hidden = Number(s.dataset.step) !== step; });
  const invalid = firstInvalid();
  document.querySelectorAll('.stepper button').forEach(b => {
    const n = Number(b.dataset.step);
    b.classList.toggle('current', n === step);
    b.classList.toggle('done', n < step);
    b.setAttribute('aria-current', n === step ? 'step' : 'false');
    b.disabled = n === 4 && invalid != null;
  });
  history.replaceState(null, '', `#paso-${step}`);
  $('#btn-back').hidden = step === 1;
  const next = $('#btn-next');
  if (step < 3) next.textContent = `Siguiente: ${STEPS[step + 1].toLowerCase()}`;
  else if (step === 3) next.textContent = 'Ver resultado';
  else next.textContent = 'Imprimir o guardar PDF';
  document.body.classList.toggle('is-result', step === 4);
  if (step === 1) { initMap(); setTimeout(() => S.map && S.map.invalidateSize(), 50); updatePlace(); }
  if (step === 4) renderResult();
  if (!S.firstShow) S.firstShow = true; else window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bind() {
  $('#theme-toggle').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(LS_THEME, t); } catch { /* */ }
    applyTheme(t);
  });
  document.querySelectorAll('.stepper button').forEach(b => b.addEventListener('click', () => goTo(Number(b.dataset.step))));
  $('#btn-back').addEventListener('click', () => goTo(Math.max(1, S.step - 1)));
  $('#btn-next').addEventListener('click', () => (S.step === 4 ? window.print() : goTo(S.step + 1)));
  $('#form').addEventListener('input', e => {
    if (e.target.id === 'in-city-search') return onCitySearch(e.target.value);
    readInputs();
    $('#step-errors').innerHTML = '';
    if (S.step === 1) updatePlace();
  });
  $('#form').addEventListener('change', e => {
    if (e.target.id === 'in-budget') e.target.value = showMoney(parseMoney(e.target.value));
  });
  $('#form').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'radio' && S.step < 4) { e.preventDefault(); goTo(S.step + 1); }
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'edit') goTo(Number(a.dataset.step));
    if (a.dataset.action === 'req-cert') { S.reqCert = a.dataset.cert; renderRequirements(); }
  });
}

function onCitySearch(v) {
  const c = S.data.cities.find(x => cityLabel(x).toLowerCase() === v.trim().toLowerCase());
  if (!c) return;
  $('#in-lat').value = c.lat; $('#in-lon').value = c.lon;
  readInputs(); updatePlace();
  if (S.map) S.map.setView([c.lat, c.lon], 8);
}

function initMap() {
  if (S.map || typeof L === 'undefined') return;
  S.map = L.map('map', { scrollWheelZoom: false }).setView([23.6, -102.5], 5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(S.map);
  S.marker = L.circleMarker([S.input.lat, S.input.lon], { radius: 8, color: '#1b2e22', weight: 2, fillColor: '#c2264f', fillOpacity: 1 }).addTo(S.map);
  S.map.on('click', ev => {
    $('#in-lat').value = ev.latlng.lat.toFixed(4);
    $('#in-lon').value = ev.latlng.lng.toFixed(4);
    $('#in-city-search').value = '';
    readInputs(); updatePlace();
  });
}

// Lectura inmediata del sitio en el paso 1
function updatePlace() {
  const i = S.input;
  if (S.marker && Number.isFinite(i.lat) && Number.isFinite(i.lon)) S.marker.setLatLng([i.lat, i.lon]);
  const box = $('#place');
  if (!(i.lat >= 14 && i.lat <= 33 && i.lon >= -119 && i.lon <= -86)) { box.innerHTML = ''; return; }
  const c = siteContext(i.lat, i.lon, S.data, S.grid);
  if (c.outside) { box.innerHTML = '<p>Este punto cae fuera de México o en el mar.</p>'; return; }
  box.innerHTML = `<dl class="kv">
    <dt>Ubicación</dt><dd>${esc(c.cityLabel)}, ${esc(c.state)}</dd>
    <dt>Clima</dt><dd>${esc(c.koppen)}, ${esc(lowerFirst(c.koppenName))}</dd>
    <dt>Acuífero</dt><dd>${esc(c.aquiferLabel)}, estrés ${esc(lowerFirst(c.level))}</dd>
  </dl>`;
}

// ---------- explicación en lenguaje claro ----------
function explain(r) {
  const cw = S.model.params.criteriaWeights[r.input.objective];
  const names = S.data.certNames;
  const rec = r.recCert, alt = r.altCert;
  const out = [];
  const top = CRITERIA.filter(k => cw[k] > 0).sort((a, b) => cw[b] - cw[a]).slice(0, 3);
  out.push(`Con el objetivo «${esc(r.input.objective)}», la puntuación depende sobre todo de ${listJoin(top.map(k => `${CRIT_PLAIN[k]} (${pct(cw[k], 0)})`))}.`);
  if (alt) {
    const diffs = CRITERIA.map(k => [k, 100 * cw[k] * (r.per[rec][k] - r.per[alt][k])]);
    const wins = diffs.filter(d => d[1] > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 2);
    const loses = diffs.filter(d => d[1] < -0.05).sort((a, b) => a[1] - b[1]).slice(0, 2);
    let s = `${esc(names[rec])} supera a ${esc(names[alt])} por ${fmt(r.advantage, 1)} puntos`;
    if (wins.length) s += `: gana en ${listJoin(wins.map(([k, v]) => `${CRIT_PLAIN[k]} (+${fmt(v, 1)})`))}`;
    if (loses.length) s += ` y pierde en ${listJoin(loses.map(([k, v]) => `${CRIT_PLAIN[k]} (${fmt(v, 1)})`))}`;
    out.push(s + '.');
  }
  const cheapest = CERTS.reduce((a, b) => (r.per[a].total <= r.per[b].total ? a : b));
  const b = r.input.budget;
  if (b === '' || b == null) {
    out.push(`Sin presupuesto indicado se comparan las tres. La más económica es ${esc(names[cheapest])} (${usd(r.per[cheapest].total)}) y ${esc(names[rec])} costaría unos ${usd(r.per[rec].total)}.`);
  } else {
    const outB = CERTS.filter(c => r.per[c].fits === 'No');
    if (outB.length === 3) out.push(`Ninguna cabe en ${usd(b)}. Se muestra la más económica, ${esc(names[cheapest])}, que necesita unos ${usd(r.per[cheapest].total)}.`);
    else if (outB.length) out.push(`Con ${usd(b)} quedan fuera ${listJoin(outB.map(c => `${esc(names[c])} (${usd(r.per[c].total)})`))}.`);
    else out.push(`Las tres caben en el presupuesto de ${usd(b)}; ${esc(names[rec])} costaría unos ${usd(r.per[rec].total)}.`);
  }
  const wi = CATS.indexOf('AGUA');
  const maxI = r.w.indexOf(Math.max(...r.w));
  const dW = r.w[wi] - r.wBase[wi];
  const water = Math.abs(dW) < 0.001 ? `el peso del agua se mantiene en ${pct(r.w[wi])}`
    : `el peso del agua ${dW > 0 ? 'sube' : 'baja'} de ${pct(r.wBase[wi])} a ${pct(r.w[wi])}`;
  out.push(`El sitio tiene clima ${esc(r.ctx.koppen)}, ${esc(lowerFirst(r.ctx.koppenName))}, y su acuífero tiene estrés ${esc(lowerFirst(r.ctx.level))}, así que ${water}. La categoría con más peso es ${esc(catName(CATS[maxI]))} (${pct(r.w[maxI])}).`);
  return out;
}

// ---------- resultado ----------
function renderResult() {
  S.result = compute(S.input, S.model, S.data, S.grid);
  if (!S.reqCert || S.lastRec !== S.result.recCert) S.reqCert = S.result.recCert;
  S.lastRec = S.result.recCert;
  const r = S.result, i = r.input, d = S.data;
  const p = r.per[r.recCert];

  $('#summary').innerHTML = `
    <div><span>Ubicación</span><strong>${esc(r.ctx.city ? r.ctx.city.name : '')}, ${esc(r.ctx.state)}</strong><button type="button" class="link" data-action="edit" data-step="1">Editar</button></div>
    <div><span>Proyecto</span><strong>${esc(i.typology)}, ${fmt(i.area, 0)} m², ${fmt(i.units, 0)} dptos.</strong><button type="button" class="link" data-action="edit" data-step="2">Editar</button></div>
    <div><span>Promotor</span><strong>${esc(i.objective)}${i.budget === '' ? '' : `, ${usd(i.budget)}`}</strong><button type="button" class="link" data-action="edit" data-step="3">Editar</button></div>`;

  const tie = r.advantage != null && r.advantage < S.model.params.tieThreshold;
  const html = [];
  html.push(`<section class="titleblock c-${r.recCert}" aria-label="Certificación recomendada">
    <div class="tb-main">
      <div><p class="tb-label">Certificación recomendada</p><p class="tb-cert">${esc(d.certNames[r.recCert])}</p></div>
      <p class="tb-verdict">${esc(r.message)}</p>
    </div>
    <dl class="tb-cells">
      <div><dt>Puntuación</dt><dd>${fmt(p.score, 1)} de 100</dd></div>
      <div><dt>Costo total estimado</dt><dd>${usd(p.total)}</dd></div>
      <div><dt>Segunda opción</dt><dd>${r.altCert ? `${esc(SHORT[r.altCert])}, ${fmt(r.advantage, 1)} pts menos` : 'Ninguna otra cabe'}</dd></div>
      <div><dt>Presupuesto</dt><dd>${i.budget === '' ? 'Sin límite' : `${usd(i.budget)}, ${p.fits === 'Sí' ? 'cabe' : 'no cabe'}`}</dd></div>
      <div><dt>Clima</dt><dd>${esc(r.ctx.koppen)}, región ${esc(lowerFirst(r.region))}</dd></div>
      <div><dt>Agua</dt><dd>Estrés ${esc(lowerFirst(r.ctx.level))}</dd></div>
    </dl>
  </section>`);

  html.push(`<section class="panel why"><h3>Por qué</h3><ul>${explain(r).map(s => `<li>${s}</li>`).join('')}</ul>
    ${tie ? `<p class="tie">La diferencia es menor de ${S.model.params.tieThreshold} puntos: conviene decidir con el caso concreto y con cotizaciones reales.</p>` : ''}
    <p class="help" style="margin-top:12px">Incentivos para ${esc(lowerFirst(i.typology))}: ${esc(r.incentivesText)}</p></section>`);

  html.push(`<section class="panel"><h3>Comparación de las tres certificaciones</h3>
    <div class="compare">${CERTS.map(c => {
      const q = r.per[c];
      const fit = q.fits === 'Sí' ? '<span class="badge ok">Cabe en el presupuesto</span>'
        : q.fits === 'No' ? '<span class="badge no">Excede el presupuesto</span>' : '<span class="badge">Sin presupuesto</span>';
      return `<div class="cmp c-${c} ${q.fits === 'No' ? 'out' : ''}">
        <div class="name"><span class="swatch"></span>${esc(d.certNames[c])}</div>
        <div class="bar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, q.score))}%"></span></div>
        <div class="score">${fmt(q.score, 1)}</div>
        <div class="cost">${usd(q.total)}<small>costo total</small></div>
        <div>${fit}</div>
      </div>`;
    }).join('')}</div>
    <details><summary>Cómo se calcula la puntuación y el costo</summary>${breakdownTable(r)}</details>
  </section>`);

  html.push('<section class="panel" id="req-panel"></section>');
  html.push(contextPanel(r));
  html.push(`<details class="tech"><summary>Detalle técnico: pesos AHP del sitio</summary>${ahpPanel(r)}</details>`);
  $('#results').innerHTML = html.join('');
  renderRequirements();
}

function breakdownTable(r) {
  const cw = S.model.params.criteriaWeights[r.input.objective];
  const t = S.data.texts.criteria;
  const head = `<tr><th>Criterio</th><th class="n">Peso</th>${CERTS.map(c => `<th class="n">${SHORT[c]}</th>`).join('')}</tr>`;
  const body = CRITERIA.map(k => `<tr><td>${esc(t[k].label)}<div class="help">${esc(t[k].what)}</div></td><td class="n">${pct(cw[k], 0)}</td>
      ${CERTS.map(c => `<td class="n">${pct(r.per[c][k])}</td>`).join('')}</tr>`).join('');
  const total = `<tr class="total"><td>Puntuación (0–100)</td><td class="n">${pct(CRITERIA.reduce((s, k) => s + Number(cw[k]), 0), 0)}</td>${CERTS.map(c => `<td class="n">${fmt(r.per[c].score, 1)}</td>`).join('')}</tr>`;
  const money = [
    ['Tarifas oficiales', c => usd(r.per[c].fees.total)],
    ['Consultoría, auditor y estudios (estimado)', c => usd(r.per[c].indirect)],
    ['Costo total estimado', c => `<strong>${usd(r.per[c].total)}</strong>`],
  ].map(([l, f]) => `<tr><td>${l}</td><td></td>${CERTS.map(c => `<td class="n">${f(c)}</td>`).join('')}</tr>`).join('');
  const fees = CERTS.map(c => `<li><strong>${SHORT[c]}:</strong> registro ${usd(r.per[c].fees.registration)} y certificación ${usd(r.per[c].fees.certification)}. ${esc(S.data.texts.feeComments[c])}</li>`).join('');
  return `<div class="table-wrap"><table class="data">${head}${body}${total}${money}</table></div>
    <ul class="help">${fees}<li>${esc(S.data.texts.indirectNote)}</li></ul>`;
}

function renderRequirements() {
  const box = $('#req-panel'); if (!box || !S.result) return;
  const r = S.result, c = S.reqCert;
  const list = r.topRequirements[c];
  const tabs = [r.recCert, ...CERTS.filter(x => x !== r.recCert)].map(x => `<button type="button" role="tab" class="c-${x}" data-action="req-cert" data-cert="${x}" aria-selected="${x === c}">
      <span class="swatch"></span>${esc(S.data.certNames[x])}${x === r.recCert ? ' (recomendada)' : ''}</button>`).join('');
  box.innerHTML = `<h3>Qué exige en este sitio</h3>
    <p class="help">Los requisitos con más peso para esta ubicación (peso de la categoría en el sitio × peso del indicador). Prioridad alta ≥ 6 %, media ≥ 3 %.</p>
    <div class="cert-tabs" role="tablist">${tabs}</div>
    ${list.slice(0, 5).map((q, i) => reqItem(q, i)).join('')}
    <details><summary>Ver los ${list.length} requisitos de ${esc(SHORT[c])} en orden</summary>${list.slice(5).map((q, i) => reqItem(q, i + 5)).join('')}</details>`;
}

function reqItem(q, i) {
  const mand = String(q.mandatory || '').toLowerCase().startsWith('sí');
  return `<article class="req">
    <div class="rank">${i + 1}<small>${pct(q.globalWeight, 1)}</small></div>
    <div>
      <h4>${esc(q.code)} ${esc(q.name)}</h4>
      <div class="tags">
        ${mand ? '<span class="badge must">Obligatorio</span>' : ''}
        <span class="badge ${q.priority === 'Alta' ? 'alta' : ''}">Prioridad ${esc(lowerFirst(q.priority))}</span>
        ${q.points ? `<span class="badge">${esc(q.points)}</span>` : ''}
        <span class="badge">${esc(catName(q.category))}</span>
      </div>
      <p><span class="k">Dificultad aquí:</span> ${esc(q.difficulty)}</p>
      ${!mand && q.mandatory && q.mandatory !== 'No' ? `<p><span class="k">¿Obligatorio?</span> ${esc(q.mandatory)}</p>` : ''}
      ${mand && q.mandatory.length > 3 ? `<p><span class="k">Condición:</span> ${esc(q.mandatory)}</p>` : ''}
      <details><summary>Qué pide, entregables y normativa mexicana</summary><div class="more">
        ${q.asks ? `<p><strong>Qué pide:</strong> ${multiline(q.asks)}</p>` : ''}
        ${q.deliverables ? `<p><strong>Entregables:</strong> ${multiline(q.deliverables)}</p>` : ''}
        ${q.nom ? `<p><strong>Normativa mexicana:</strong> ${multiline(q.nom)}</p>` : ''}
        ${q.source ? `<p><strong>Fuente:</strong> ${esc(q.source)}</p>` : ''}
      </div></details>
    </div>
  </article>`;
}

function contextPanel(r) {
  const c = r.ctx, aq = c.aquifer, kl = c.koppenLegend;
  const kv = [
    ['Ubicación', `${esc(c.cityLabel)}, estado de ${esc(c.state)}`],
    ['Clima (Beck et al., 2023)', `${esc(c.koppen)}, ${esc(lowerFirst(c.koppenName))}${c.rubel !== c.koppen ? ` (Rubel 2017: ${esc(c.rubel)})` : ''}`],
    ['Región para los pesos', esc(r.region)],
    ['Acuífero', `${esc(c.aquiferLabel)}, ${esc(lowerFirst(c.condition))}`],
    ['Disponibilidad', aq ? `${fmt(aq.dma, 1)} hm³/año, índice de explotación ${typeof aq.index === 'number' ? fmt(aq.index, 2) : '—'}` : '—'],
    ['Estrés del acuífero', esc(c.level)],
    ['Región hidrológica', `${esc(c.rhaLabel)}${c.rhaPressure != null ? `, presión ${pct(c.rhaPressure)} (${esc(lowerFirst(c.rhaClass))})` : ''}`],
  ];
  return `<section class="panel"><h3>El sitio</h3>
    <dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${c.implication && c.implication !== '—' ? `<p class="callout"><strong>Agua:</strong> ${esc(c.implication)}</p>` : ''}
    ${kl ? `<p class="callout"><strong>Clima:</strong> ${esc(kl.implication)}</p>` : ''}
    <p class="help">Celda de la malla <code>${esc(c.key)}</code>. Origen del dato del acuífero: ${esc(lowerFirst(c.aquiferOrigin))}.</p>
  </section>`;
}

function ahpPanel(r) {
  const rows = CATS.map((cat, i) => {
    const ch = (r.w[i] - r.wBase[i]) * 100;
    return `<tr><td>${esc(cat)}</td><td class="n">${pct(r.wBase[i])}</td>
      <td style="width:28%"><div class="bar"><span style="width:${(r.w[i] * 200).toFixed(1)}%"></span></div></td>
      <td class="n"><strong>${pct(r.w[i])}</strong></td>
      <td class="n ${ch >= 0 ? 'pos' : 'negv'}">${ch >= 0 ? '+' : ''}${fmt(ch, 1)}</td></tr>`;
  }).join('');
  const m = r.siteAHP;
  const matrix = `<table class="data"><tr><th></th>${CATS.map(c => `<th class="n">${esc(c.slice(0, 6))}.</th>`).join('')}<th class="n">Peso</th></tr>
    ${m.matrix.map((row, i) => `<tr><td>${esc(CATS[i])}</td>${row.map(v => `<td class="n">${fmt(v, 3)}</td>`).join('')}<td class="n">${pct(m.w[i])}</td></tr>`).join('')}</table>`;
  const just = S.model.pairs.map(p => `<li><strong>${esc(p.a)} vs ${esc(p.b)}</strong> = ${esc(showNum(Number(p.values[r.region])))}: ${esc(p.why[r.region])}</li>`).join('');
  return `<p class="help">Se usan los juicios por pares de la región ${esc(r.region)} y se ajusta el AGUA según el estrés del acuífero.</p>
    <dl class="kv">
      <dt>Índice de estrés del sitio</dt><dd>${r.stressIndex ?? '—'} (1 escasa, 5 déficit)</dd>
      <dt>Nivel de referencia de la región</dt><dd>${fmt(r.refLevel, 1)}</dd>
      <dt>Factor de ajuste del agua (f)</dt><dd>${fmt(r.f, 3)} = ${fmt(S.model.params.sensitivity, 2)}^(${r.stressIndex ?? '—'} − ${fmt(r.refLevel, 1)})</dd>
      <dt>Consistencia</dt><dd class="cr ${m.consistent ? '' : 'bad'}">λmax ${fmt(m.lambda, 3)}, CI ${fmt(m.ci, 4)}, CR ${fmt(m.cr, 4)}: ${m.consistent ? 'consistente' : 'revisar'}</dd>
    </dl>
    <div class="table-wrap" style="margin-top:12px"><table class="data"><tr><th>Categoría</th><th class="n">Base de la región</th><th></th><th class="n">Sitio</th><th class="n">Cambio (pts)</th></tr>${rows}</table></div>
    <details><summary>Matriz de juicios ajustada (fila vs columna)</summary><div class="table-wrap">${matrix}</div></details>
    <details><summary>Justificación de los juicios de la región ${esc(r.region)}</summary><ul class="more">${just}</ul></details>`;
}

init().catch(err => {
  console.error(err);
  const box = $('#loading');
  if (box) box.textContent = 'No se pudieron cargar los datos. Si abriste index.html con doble clic, inicia un servidor local (instrucciones en el README).';
});
