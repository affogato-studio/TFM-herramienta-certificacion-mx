// Interfaz de la herramienta. Toda la lógica de cálculo está en engine.js.
import {
  CATS, CERTS, REGIONS, compute, defaultModel, gridStress, regionMeans, stateSummary,
  ahpWeights, regionMatrix, reciprocalMatrix,
} from './engine.js';

const S = {
  data: null, grid: null, model: null, base: null, input: null, result: null, cells: null,
  map: null, marker: null, tiles: null, tab: 'tool', refTab: 'req', reqCert: null, stateSort: null,
};
const $ = sel => document.querySelector(sel);
const LS_INPUT = 'tfm-cert-input-v1';
const LS_MODEL = 'tfm-cert-model-v1';
const LS_THEME = 'tfm-theme';

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
  'Inversión extranjera / fondos internacionales': 'Atraer capital de fondos internacionales: pesan el reconocimiento global y la exigencia técnica.',
  'Inversión europea (fondos UE / Reino Unido)': 'Fondos de la Unión Europea o del Reino Unido, donde BREEAM es la referencia.',
  'Reconocimiento internacional / marca premium': 'Posicionar el proyecto como producto premium con un sello reconocido en todo el mundo.',
  'Máximo desempeño ambiental': 'Lograr el mejor resultado ambiental: importa que la certificación atienda las prioridades del sitio y sea exigente.',
  'Mínimo coste y financiamiento local': 'Certificar al menor costo y acceder a créditos verdes mexicanos (Infonavit, EcoCasa, SHF).',
  'Personalizado': 'Pesos casi iguales entre criterios. Puedes ajustarlos en la pestaña Parámetros.',
};
const SHORT = { LEED: 'LEED', BREEAM: 'BREEAM', EDGE: 'EDGE' };

// ---------- utilidades ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = d => new Intl.NumberFormat('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt = (n, d = 2) => (n == null || Number.isNaN(n) ? '—' : nf(d).format(n));
const pct = (n, d = 1) => (n == null || Number.isNaN(n) ? '—' : nf(d).format(n * 100) + ' %');
const usd = n => (n == null || Number.isNaN(n) ? '—' : 'US$ ' + nf(0).format(n));
const multiline = s => esc(s).replace(/\n/g, '<br>');
const lowerFirst = s => (s ? s[0].toLowerCase() + s.slice(1) : s);
function load(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }
function parseNum(s) {
  s = String(s).trim().replace(',', '.');
  if (s.startsWith('=')) s = s.slice(1);
  const m = s.match(/^(-?\d*\.?\d+)\s*\/\s*(-?\d*\.?\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  return s === '' ? NaN : Number(s);
}
function showNum(v, frac = true) {
  if (typeof v !== 'number') return v ?? '';
  if (frac && v > 0 && v < 1) {
    const inv = 1 / v;
    if (Math.abs(inv - Math.round(inv)) < 1e-9) return `1/${Math.round(inv)}`;
  }
  return String(+v.toFixed(6));
}
const parseMoney = s => { const d = String(s).replace(/[^\d.]/g, ''); return d === '' ? '' : Number(d); };
const showMoney = v => (v === '' || v == null ? '' : nf(0).format(v));
const listJoin = arr => (arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1]);

// Hoja de caladio dibujada en SVG (decorativa)
function leafSVG(id, cls = '') {
  const veins = [[14, 32], [9, 56], [20, 84], [86, 32], [91, 56], [80, 84]]
    .map(([x, y]) => `<path d="M50 32 Q ${(50 + x) / 2} ${Math.min(32, y) + (y - 32) * 0.35} ${x} ${y}"/>`).join('');
  return `<svg class="${cls}" viewBox="0 0 100 120" aria-hidden="true" focusable="false">
    <defs><radialGradient id="${id}" cx="50%" cy="34%" r="72%">
      <stop offset="0" stop-color="#c2264f"/><stop offset=".5" stop-color="#ef8ea9"/><stop offset=".82" stop-color="#e6f0d6"/><stop offset="1" stop-color="#9cc58a"/>
    </radialGradient></defs>
    <path d="M50 114 C 30 94, 4 72, 6 40 C 8 14, 32 6, 45 22 L50 30 L55 22 C 68 6, 92 14, 94 40 C 96 72, 70 94, 50 114 Z" fill="url(#${id})" stroke="#2f6b3c" stroke-width="4" stroke-linejoin="round"/>
    <g stroke="#8e1a3e" stroke-width="1.8" fill="none" stroke-linecap="round"><path d="M50 30 L50 110"/>${veins}</g>
  </svg>`;
}

// ---------- tema ----------
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const b = $('#theme-toggle');
  b.textContent = t === 'dark' ? 'Modo claro' : 'Modo oscuro';
  b.setAttribute('aria-pressed', String(t === 'dark'));
  if (S.map) setTiles();
}
function setTiles() {
  if (S.tiles) return; // el modo oscuro se resuelve con un filtro CSS sobre los mosaicos
  S.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(S.map);
}
const catName = c => String(c || '').toLowerCase();

// ---------- arranque ----------
async function init() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [data, grid] = await Promise.all([
    fetch('data/base.json').then(r => r.json()),
    fetch('data/grid.json').then(r => r.json()),
  ]);
  S.data = data; S.grid = grid;
  S.base = defaultModel(data);
  S.model = validModel(load(LS_MODEL), data) || defaultModel(data);
  S.input = sanitizeInput(load(LS_INPUT), data);
  $('#src-file').textContent = data.source;
  $('.brand h1').insertAdjacentHTML('afterbegin', leafSVG('leaf-h'));

  $('#in-typology').innerHTML = data.typologies.map(v => `<option>${esc(v)}</option>`).join('');
  $('#in-objective').innerHTML = data.objectives.map(v => `<option>${esc(v)}</option>`).join('');
  $('#city-list').innerHTML = [...data.cities].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map(c => `<option value="${esc(cityLabel(c))}"></option>`).join('');
  writeInputs();
  bind();
  $('#loading').remove();
  showTab(TAB_HASH[location.hash.slice(1)] || 'tool');
  recompute();
}
const cityLabel = c => `${c.name}, ${c.state}`;

// Valores guardados en el navegador que ya no existen (p. ej. tras actualizar el Excel) se descartan.
function sanitizeInput(saved, data) {
  const i = { ...data.example, ...(saved && typeof saved === 'object' ? saved : {}) };
  if (!data.typologies.includes(i.typology)) i.typology = data.example.typology;
  if (!data.objectives.includes(i.objective)) i.objective = data.example.objective;
  if (!['Sí', 'No'].includes(i.usgbc)) i.usgbc = data.example.usgbc;
  return i;
}
function validModel(m, data) {
  if (!m || !m.params || !m.pairs || !m.indicatorMatrices) return null;
  const p = m.params;
  const ok = data.objectives.every(o => p.criteriaWeights?.[o] && p.investment?.[o]) &&
    data.typologies.every(t => p.incentives?.[t]) && m.pairs.length === data.ahp.pairs.length;
  return ok ? m : null;
}

function writeInputs() {
  const i = S.input;
  $('#in-lat').value = i.lat; $('#in-lon').value = i.lon;
  $('#in-typology').value = i.typology; $('#in-area').value = i.area; $('#in-units').value = i.units;
  document.querySelectorAll('input[name="usgbc"]').forEach(r => { r.checked = r.value === i.usgbc; });
  $('#in-budget').value = showMoney(i.budget); $('#in-objective').value = i.objective;
  $('#in-city-search').value = '';
}

function readInputs() {
  S.input = {
    lat: Number($('#in-lat').value), lon: Number($('#in-lon').value),
    typology: $('#in-typology').value, area: Number($('#in-area').value), units: Number($('#in-units').value),
    usgbc: (document.querySelector('input[name="usgbc"]:checked') || {}).value || 'Sí',
    budget: parseMoney($('#in-budget').value), objective: $('#in-objective').value,
  };
  save(LS_INPUT, S.input);
}

function validate(i) {
  const e = [];
  if (!(i.lat >= 14 && i.lat <= 33)) e.push('La latitud debe estar entre 14 y 33. Haz clic en el mapa o busca una ciudad.');
  if (!(i.lon >= -119 && i.lon <= -86)) e.push('La longitud debe estar entre −119 y −86 (negativa, al oeste).');
  if (!(i.area > 0)) e.push('Escribe la superficie construida en m².');
  if (!(i.units >= 0)) e.push('Escribe el número de departamentos (0 si no hay).');
  return e;
}

function bind() {
  $('#theme-toggle').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(LS_THEME, t); } catch { /* */ }
    applyTheme(t);
  });
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#form').addEventListener('input', e => {
    if (e.target.id === 'in-city-search') return onCitySearch(e.target.value);
    readInputs(); recompute();
  });
  $('#form').addEventListener('change', e => {
    if (e.target.id === 'in-budget') e.target.value = showMoney(parseMoney(e.target.value));
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'print') window.print();
    if (act === 'example') { S.input = { ...S.data.example }; save(LS_INPUT, S.input); writeInputs(); recompute(); }
    if (act === 'reset') { S.model = defaultModel(S.data); afterModelChange(); }
    if (act === 'export-params') downloadParams();
    if (act === 'req-cert') { S.reqCert = a.dataset.cert; renderRequirements(); }
  });
  $('#import-params').addEventListener('change', importParams);
  $('#params-body').addEventListener('change', onParamEdit);
  $('#ref-tabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    S.refTab = b.dataset.sub; renderRef();
  });
  $('#ref-body').addEventListener('input', () => renderRefTable());
  $('#states-table').addEventListener('click', e => {
    const th = e.target.closest('th'); if (!th) return;
    const k = th.dataset.k; S.stateSort = S.stateSort === k ? '-' + k : k; renderStates();
  });
}

function onCitySearch(v) {
  const c = S.data.cities.find(x => cityLabel(x).toLowerCase() === v.trim().toLowerCase());
  if (!c) return;
  $('#in-lat').value = c.lat; $('#in-lon').value = c.lon;
  readInputs(); recompute();
  if (S.map) S.map.setView([c.lat, c.lon], 8);
}

const TAB_HASH = { herramienta: 'tool', estados: 'states', consulta: 'ref', parametros: 'params' };
function showTab(t) {
  S.tab = t;
  const h = Object.keys(TAB_HASH).find(k => TAB_HASH[k] === t);
  if (location.hash.slice(1) !== h) history.replaceState(null, '', '#' + h);
  document.querySelectorAll('.tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === t);
    b.setAttribute('aria-selected', String(b.dataset.tab === t));
  });
  document.querySelectorAll('.tab').forEach(s => { s.hidden = s.id !== 'tab-' + t; });
  if (t === 'tool') { initMap(); setTimeout(() => S.map && S.map.invalidateSize(), 50); }
  if (t === 'states') renderStates();
  if (t === 'ref') renderRef();
  if (t === 'params') renderParams();
}

function initMap() {
  if (S.map || typeof L === 'undefined') return;
  S.map = L.map('map', { scrollWheelZoom: false }).setView([23.6, -102.5], 4);
  setTiles();
  S.marker = L.circleMarker([S.input.lat, S.input.lon], { radius: 7, color: '#1b2e22', weight: 2, fillColor: '#c2264f', fillOpacity: 1 }).addTo(S.map);
  S.map.on('click', ev => {
    $('#in-lat').value = ev.latlng.lat.toFixed(4);
    $('#in-lon').value = ev.latlng.lng.toFixed(4);
    $('#in-city-search').value = '';
    readInputs(); recompute();
  });
}

// ---------- cálculo ----------
function recompute() {
  const errs = validate(S.input);
  $('#in-errors').innerHTML = errs.map(esc).join('<br>');
  const obj = S.input.objective;
  const cw = S.model.params.criteriaWeights[obj];
  if (cw) {
    const top = CRITERIA.filter(k => cw[k] > 0).sort((a, b) => cw[b] - cw[a]).slice(0, 3);
    $('#objective-help').textContent = `${OBJECTIVE_HELP[obj] || ''} Pesa más: ${listJoin(top.map(k => `${CRIT_PLAIN[k]} (${pct(cw[k], 0)})`))}.`;
  }
  if (S.marker && Number.isFinite(S.input.lat) && Number.isFinite(S.input.lon)) S.marker.setLatLng([S.input.lat, S.input.lon]);
  if (errs.length) {
    $('#place').textContent = '';
    $('#results').innerHTML = `<div class="warning">Para ver el resultado, corrige lo siguiente:<br>${errs.map(esc).join('<br>')}</div>`;
    return;
  }
  S.result = compute(S.input, S.model, S.data, S.grid);
  const c = S.result.ctx;
  $('#place').innerHTML = c.outside ? 'Fuera de México o en el mar: mueve el punto en el mapa.'
    : `${esc(c.city ? c.city.name : '')}, ${esc(c.state)}. Clima ${esc(c.koppen)}, acuífero con estrés ${esc(lowerFirst(c.level))}.`;
  if (!S.reqCert || !CERTS.includes(S.reqCert) || S.lastRec !== S.result.recCert) S.reqCert = S.result.recCert;
  S.lastRec = S.result.recCert;
  renderResults();
  if (S.tab === 'states') renderStates();
  if (S.tab === 'ref' && S.refTab === 'req') renderRefTable();
  $('#modified').hidden = JSON.stringify(S.model) === JSON.stringify(S.base);
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
  if (!r.ctx.outside) {
    out.push(`El sitio tiene clima ${esc(r.ctx.koppen)}, ${esc(lowerFirst(r.ctx.koppenName))}, y su acuífero tiene estrés ${esc(lowerFirst(r.ctx.level))}, así que ${water}. La categoría con más peso es ${esc(catName(CATS[maxI]))} (${pct(r.w[maxI])}).`);
  }
  return out;
}

// ---------- resultados ----------
function renderResults() {
  const r = S.result, d = S.data;
  const p = r.per[r.recCert];
  const html = [];
  if (r.warning) html.push(`<div class="warning">${esc(r.warning)}</div>`);
  const tie = r.advantage != null && r.advantage < S.model.params.tieThreshold;

  html.push(`<section class="titleblock c-${r.recCert}" aria-label="Certificación recomendada">
    <div class="tb-main">
      ${leafSVG('leaf-tb', 'tb-leaf')}
      <div><p class="tb-label">Certificación recomendada</p><h2 class="tb-cert">${esc(d.certNames[r.recCert])}</h2></div>
      <p class="tb-verdict">${esc(r.message)}</p>
    </div>
    <dl class="tb-cells">
      <div><dt>Puntuación</dt><dd>${fmt(p.score, 1)} de 100</dd></div>
      <div><dt>Costo total estimado</dt><dd>${usd(p.total)}</dd></div>
      <div><dt>Segunda opción</dt><dd>${r.altCert ? `${esc(SHORT[r.altCert])}, ${fmt(r.advantage, 1)} pts menos` : 'Ninguna otra cabe'}</dd></div>
      <div><dt>Presupuesto</dt><dd>${r.input.budget === '' ? 'Sin límite' : `${usd(r.input.budget)}, ${p.fits === 'Sí' ? 'cabe' : 'no cabe'}`}</dd></div>
      <div><dt>Sitio</dt><dd>${esc(r.ctx.city ? r.ctx.city.name : '—')}, ${esc(r.ctx.state)}</dd></div>
      <div><dt>Clima y agua</dt><dd>${esc(r.ctx.koppen)}, estrés ${esc(lowerFirst(r.ctx.level))}</dd></div>
    </dl>
  </section>`);

  html.push(`<section class="panel why"><h2>Por qué</h2><ul>${explain(r).map(s => `<li>${s}</li>`).join('')}</ul>
    ${tie ? `<p class="tie">La diferencia es menor de ${S.model.params.tieThreshold} puntos: conviene decidir con el caso concreto y con cotizaciones reales.</p>` : ''}
    <p class="help" style="margin-top:12px">Incentivos para ${esc(lowerFirst(r.input.typology))}: ${esc(r.incentivesText)}</p></section>`);

  html.push(`<section class="panel"><h2>Comparación de las tres certificaciones</h2>
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

  html.push(`<section class="panel" id="req-panel"></section>`);
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
  box.innerHTML = `<h2>Qué exige en este sitio</h2>
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
  return `<section class="panel"><h2>El sitio</h2>
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

// ---------- resumen por estados ----------
function renderStates() {
  if (!S.result) return;
  if (!S.cells || S.cellsModel !== JSON.stringify(S.model.params.stressIndex)) {
    S.cells = gridStress(S.model, S.data, S.grid);
    S.cellsModel = JSON.stringify(S.model.params.stressIndex);
  }
  const rows = stateSummary(S.result, S.model, S.data, S.cells);
  const r = S.result;
  $('#states-note').innerHTML = `Qué certificación saldría en cada estado para un proyecto como el tuyo. Cada estado usa los pesos de su región climática dominante, con el agua ajustada por el estrés medio de sus acuíferos. El objetivo («${esc(r.input.objective)}»), el presupuesto y los criterios económicos son los del proyecto de la pestaña Herramienta, igual que en la hoja RESUMEN_ESTADOS. Haz clic en un encabezado para ordenar.`;
  const count = c => rows.filter(x => x.recommended === c).length;
  const ties = rows.filter(x => x.advantage != null && x.advantage < S.model.params.tieThreshold).length;
  $('#states-summary').innerHTML = CERTS.map(c => `<span class="chip c-${c}"><span class="swatch"></span>${SHORT[c]}: ${count(c)} estados</span>`).join('') +
    `<span class="chip">Empate técnico (menos de ${S.model.params.tieThreshold} pts): ${ties}</span>`;
  const cols = [
    ['state', 'Estado', x => esc(x.state)], ['cells', 'Celdas', x => x.cells, 1],
    ['pA', '% tropical', x => pct(x.pA, 0), 1], ['pB', '% árido', x => pct(x.pB, 0), 1], ['pC', '% templado', x => pct(x.pC, 0), 1],
    ['dominant', 'Región dominante', x => esc(x.dominant)], ['over', '% sobreexplotado', x => pct(x.over, 0), 1],
    ['meanIdx', 'Estrés medio', x => fmt(x.meanIdx, 2), 1], ['f', 'Factor f', x => fmt(x.f, 2), 1],
    ...CATS.map((c, i) => [`w${i}`, c.charAt(0) + c.slice(1, 6).toLowerCase() + '.', x => pct(x.w[i]), 1]),
    ...CERTS.map(c => [c, SHORT[c], x => fmt(x.scores[c], 1), 1]),
    ['recommended', 'Recomendada', x => `<span class="c-${x.recommended}" style="display:inline-flex;gap:6px;align-items:center"><span class="swatch"></span>${x.recommended}</span>`],
    ['advantage', 'Ventaja (pts)', x => fmt(x.advantage, 1), 1],
  ];
  const val = (x, k) => (k[0] === 'w' && k.length === 2 ? x.w[+k[1]] : CERTS.includes(k) ? x.scores[k] : x[k]);
  if (S.stateSort) {
    const desc = S.stateSort.startsWith('-'); const k = S.stateSort.replace('-', '');
    rows.sort((a, b) => { const va = val(a, k), vb = val(b, k); const o = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb; return desc ? -o : o; });
  }
  $('#states-table').innerHTML = `<thead><tr>${cols.map(([k, l, , n]) => `<th data-k="${k}" class="${n ? 'n' : ''}">${l}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(x => `<tr class="${x.state === r.ctx.state ? 'hl' : ''}">${cols.map(([, , f, n]) => `<td class="${n ? 'n' : ''}">${f(x)}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

// ---------- consulta ----------
const REF_TABS = [
  ['req', 'Requisitos'], ['nom', 'Normativa mexicana'], ['inc', 'Incentivos'], ['cert', 'Certificaciones'],
  ['conc', 'Conclusiones'], ['koppen', 'Clima Köppen'], ['water', 'Estrés hídrico'], ['ahp', 'Pesos AHP'],
];
const field = (id, label, control) => `<div><label for="${id}">${label}</label>${control}</div>`;

function renderRef() {
  $('#ref-tabs').innerHTML = REF_TABS.map(([k, l]) => `<button data-sub="${k}" class="${S.refTab === k ? 'active' : ''}">${l}</button>`).join('');
  const d = S.data;
  const search = field('ref-q', 'Buscar', '<input type="search" id="ref-q" placeholder="Texto, código o norma">');
  let html;
  if (S.refTab === 'req') {
    html = `<div class="filters">${search}
      ${field('ref-cert', 'Certificación', `<select id="ref-cert"><option value="">Todas</option>${CERTS.map(c => `<option>${c}</option>`).join('')}</select>`)}
      ${field('ref-cat', 'Categoría', `<select id="ref-cat"><option value="">Todas</option>${CATS.map(c => `<option>${c}</option>`).join('')}</select>`)}
      ${field('ref-pri', 'Prioridad en tu sitio', '<select id="ref-pri"><option value="">Todas</option><option>Alta</option><option>Media</option><option>Baja</option></select>')}
    </div><div class="table-wrap" id="ref-table"></div>`;
  } else if (S.refTab === 'cert') {
    html = `<div class="filters">${field('ref-aspect', 'Aspecto', `<select id="ref-aspect">${d.certificaciones.aspects.map(a => `<option>${esc(a)}</option>`).join('')}</select>`)}</div><div id="ref-table"></div>`;
  } else if (S.refTab === 'ahp') {
    html = ahpReference();
  } else {
    html = `<div class="filters">${search}</div><div class="table-wrap" id="ref-table"></div>`;
  }
  $('#ref-body').innerHTML = html;
  renderRefTable();
}

function genericTable(t, q, groupFirst = false) {
  const keep = t.headers.map((h, i) => h != null || t.rows.some(r => r[i] != null));
  const heads = t.headers.filter((_, i) => keep[i]);
  const rows = t.rows.filter(r => !q || r.join(' ').toLowerCase().includes(q));
  return `<table class="data"><thead><tr>${heads.map(h => `<th>${esc(h ?? '')}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r => {
      const vals = r.filter((_, i) => keep[i]);
      if (groupFirst && vals.slice(1).every(v => v == null)) return `<tr class="group"><td colspan="${vals.length}">${esc(vals[0])}</td></tr>`;
      return `<tr>${vals.map(v => `<td class="${String(v ?? '').length > 80 ? 'cell-long' : ''}">${multiline(v)}</td>`).join('')}</tr>`;
    }).join('')}</tbody></table>`;
}

function renderRefTable() {
  const box = $('#ref-table'); if (!box) return;
  const d = S.data;
  const q = ($('#ref-q')?.value || '').trim().toLowerCase();
  if (S.refTab === 'req') {
    const cert = $('#ref-cert').value, cat = $('#ref-cat').value, pri = $('#ref-pri').value;
    const list = (S.result ? S.result.requirements : d.requirements).filter(r =>
      (!cert || r.certKey === cert) && (!cat || r.category === cat) && (!pri || r.priority === pri) &&
      (!q || Object.values(r).join(' ').toLowerCase().includes(q)));
    const H = d.requirementHeaders;
    box.innerHTML = `<p class="help">${list.length} requisitos. El peso y la prioridad corresponden al sitio de la pestaña Herramienta.</p>
      <table class="data"><thead><tr><th>Certificación</th><th>Categoría</th><th>Código</th><th>Nombre</th><th>Tipo</th><th>Puntos</th><th>¿Obligatorio?</th><th>Indicador</th><th class="n">Peso</th><th>Prioridad</th></tr></thead><tbody>
      ${list.map(r => `<tr><td>${esc(r.cert)}</td><td>${esc(r.category)}</td><td>${esc(r.code)}</td>
        <td class="cell-long">${esc(r.name)}<details><summary>Detalle</summary><div class="more">
          ${['objective', 'asks', 'studies', 'deliverables', 'dependsOn', 'difficulty', 'nom', 'source'].filter(k => r[k]).map(k => `<p><strong>${esc(H[k])}:</strong> ${multiline(r[k])}</p>`).join('')}
        </div></details></td>
        <td>${esc(r.type)}</td><td>${esc(r.points)}</td><td>${esc(r.mandatory)}</td><td>${esc(r.indicator)}</td>
        <td class="n">${r.globalWeight == null ? '—' : pct(r.globalWeight, 2)}</td><td>${esc(r.priority)}</td></tr>`).join('')}
      </tbody></table>`;
  } else if (S.refTab === 'nom') {
    box.innerHTML = `<h3>${esc(d.nom.title1)}</h3>${genericTable(d.nom.table1, q)}`;
  } else if (S.refTab === 'inc') {
    box.innerHTML = `<h3>${esc(d.nom.title2)}</h3>${genericTable(d.nom.table2, q)}
      <h3>Incentivos según la tipología (usados en la puntuación)</h3>
      <table class="data"><tr><th>Tipología</th><th>Incentivos que aplican</th></tr>${d.typologies.map(t => `<tr><td>${esc(t)}</td><td>${esc(d.texts.incentiveNotes[t])}</td></tr>`).join('')}</table>
      <h3>Resumen (hoja CERTIFICACIONES)</h3><p class="more">${multiline(d.certificaciones.incentivos)}</p>`;
  } else if (S.refTab === 'cert') {
    const a = $('#ref-aspect').value;
    const blocks = Object.entries(d.certificaciones.blocks);
    const heads = blocks[0][1].headers;
    box.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>${esc(a)}</th>${blocks.map(([n]) => `<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>
      ${heads.map((h, i) => `<tr><td><strong>${esc(h)}</strong></td>${blocks.map(([, b]) => {
        const v = (b.rows[a] || [])[i];
        return `<td class="cell-long">${typeof v === 'number' && v < 1 ? pct(v) : multiline(v)}</td>`;
      }).join('')}</tr>`).join('')}
      </tbody></table></div>
      ${d.certificaciones.normativa[a] ? `<h3>Normativa mexicana</h3><p class="more">${multiline(d.certificaciones.normativa[a])}</p>` : ''}`;
  } else if (S.refTab === 'conc') {
    box.innerHTML = genericTable(d.conclusiones, q, true);
  } else if (S.refTab === 'koppen') {
    box.innerHTML = genericTable({
      headers: ['Código', 'Grupo', 'Nombre', 'Criterio (Beck et al. 2018/2023)', 'Implicación para el diseño', '% del territorio'],
      rows: d.koppenLegend.map(k => [k.code, k.group, k.name, k.criterion, k.implication, k.pct]),
    }, q);
  } else if (S.refTab === 'water') {
    box.innerHTML = `<h3>Escala de estrés hídrico</h3>${genericTable({
      headers: ['Nivel', 'Rango', 'Criterio', 'Fuente', 'Implicación para el diseño'],
      rows: d.stressScale.map(s => [s.level, s.range, s.criterion, s.source, s.implication]) }, q)}
      <p class="help">${esc(d.stressNote)}</p>
      <h3>Regiones hidrológico-administrativas (CONAGUA 2020)</h3>${genericTable({
      headers: ['RHA', 'Nombre', 'Grado de presión (%)', 'Clasificación', 'Lectura', 'Nº acuíferos', 'En déficit', 'Disponibilidad neta (hm³/año)'],
      rows: d.rha.map(r => [r.code, r.name, r.pressure, r.class, r.reading, r.aquifers, r.deficit, r.net]) }, q)}
      <h3>Acuíferos (DOF 2023)</h3>${genericTable({
      headers: ['Clave', 'Acuífero', 'Estado', 'RHA', 'Disponibilidad (hm³/año)', 'Condición', 'Índice de explotación', 'Nivel de estrés'],
      rows: Object.entries(d.aquifers).map(([k, a]) => [k.padStart(4, '0'), a.name, a.state, a.rha, typeof a.dma === 'number' ? +a.dma.toFixed(2) : a.dma, a.condition, typeof a.index === 'number' ? +a.index.toFixed(3) : a.index, a.level]) }, q)}`;
  }
}

function ahpReference() {
  const a = S.data.ahp;
  const sys = a.systems.map(s => `<tr><td>${esc(s.name)}</td>${s.weights.map(w => `<td class="n">${pct(w)}</td>`).join('')}<td>${esc(s.source)}</td></tr>`).join('');
  const regs = REGIONS.map(r => ({ r, w: ahpWeights(regionMatrix(S.model.pairs, r)) }));
  const prop = regs.map(({ r, w }) => `<tr><td>Propuesta México, ${esc(r)}</td>${w.w.map(x => `<td class="n">${pct(x)}</td>`).join('')}<td>CR ${fmt(w.cr, 4)}</td></tr>`).join('');
  return `<p class="more">${esc(a.method)}</p>
    <h3>Criterios para dar más peso a una categoría</h3>
    <div class="table-wrap">${genericTable({ headers: ['Criterio', 'Qué dicen los artículos', 'Fuente', 'Cómo se aplica en México', 'Dato de México y fuente'],
      rows: a.criteria.map(c => [c.title, c.literature, c.source, c.mexico, c.data]) }, '')}</div>
    <h3>Comparación con los pesos de otros sistemas</h3>
    <div class="table-wrap"><table class="data"><tr><th>Sistema</th>${CATS.map(c => `<th class="n">${esc(c)}</th>`).join('')}<th>Fuente</th></tr>${sys}${prop}</table></div>
    <p class="help">${esc(a.matchNote)}</p>
    <h3>Indicadores dentro de cada categoría</h3><p class="help">${esc(a.indicatorRule)}</p>
    <div class="table-wrap">${genericTable({ headers: ['Código', 'Categoría', 'Indicador', 'Requisitos que agrupa', 'Por qué'],
      rows: a.indicators.map(i => [i.code, i.category, i.name, i.groups, i.why]) }, '')}</div>
    <h3>Conclusión: ¿qué debería pesar más en México?</h3>
    ${a.conclusions.map(c => `<p><strong>${esc(c.title)}</strong><br><span class="more">${esc(c.text)}</span></p>`).join('')}`;
}

// ---------- parámetros ----------
const P = (...path) => `data-path='${esc(JSON.stringify(path))}'`;
function getPath(obj, path) { return path.reduce((o, k) => o[k], obj); }
function setPath(obj, path, v) { const last = path[path.length - 1]; getPath(obj, path.slice(0, -1))[last] = v; }
function realPath(path) {
  if (path[1] === '__triple') return ['params', { 'Facilidad técnica y documental': 'ease', 'Reconocimiento en el mercado mexicano': 'marketMX', 'Exigencia técnica': 'rigor' }[path[2]], path[3]];
  if (path[1] === '__indirect') return ['params', path[2].startsWith('Fijo') ? 'indirectFixed' : 'indirectPerM2', path[3]];
  return path;
}
function numCell(path, v) {
  const real = realPath(path);
  const changed = JSON.stringify(getPath(S.base, real)) !== JSON.stringify(v);
  const frac = real[0] !== 'params';
  return `<input ${P(...path)} value="${esc(showNum(v, frac))}" class="${changed ? 'changed' : ''}" inputmode="decimal" aria-label="${esc(path.slice(1).join(' · '))}">`;
}
function certTable(title, rowsObj, pathBase, note) {
  const rows = Object.entries(rowsObj).map(([k, v]) => `<tr><td>${esc(k)}</td>${CERTS.map(c => `<td>${numCell([...pathBase, k, c], v[c])}</td>`).join('')}</tr>`).join('');
  return `<h3>${esc(title)}</h3>${note ? `<p class="help">${esc(note)}</p>` : ''}<div class="table-wrap"><table class="data"><tr><th></th>${CERTS.map(c => `<th>${c}</th>`).join('')}</tr>${rows}</table></div>`;
}

function renderParams() {
  const m = S.model, p = m.params, d = S.data;
  const cwRows = d.objectives.map(o => {
    const sum = CRITERIA.reduce((s, k) => s + Number(p.criteriaWeights[o][k]), 0);
    return `<tr><td>${esc(o)}</td>${CRITERIA.map(k => `<td>${numCell(['params', 'criteriaWeights', o, k], p.criteriaWeights[o][k])}</td>`).join('')}
      <td class="n ${Math.abs(sum - 1) > 1e-6 ? 'negv' : ''}">${pct(sum, 0)}</td></tr>`;
  }).join('');
  const means = regionMeans(S.cells || (S.cells = gridStress(m, d, S.grid)));
  const regionCR = REGIONS.map(r => {
    const res = ahpWeights(regionMatrix(m.pairs, r));
    return `<td class="cr ${res.consistent ? '' : 'bad'}">CR ${fmt(res.cr, 4)}<br>${res.consistent ? 'Consistente' : 'Revisar'}</td>`;
  }).join('');
  const pairRows = m.pairs.map((pr, i) => `<tr><td>${esc(pr.a)} vs ${esc(pr.b)}</td>${REGIONS.map(r => `<td>${numCell(['pairs', i, 'values', r], pr.values[r])}</td>`).join('')}</tr>`).join('');
  const indBlocks = Object.entries(m.indicatorMatrices).map(([cat, im]) => {
    const res = ahpWeights(reciprocalMatrix(im.matrix));
    const rows = im.codes.map((code, i) => `<tr><td>${esc(code)}</td>${im.codes.map((_, j) => (j > i
      ? `<td>${numCell(['indicatorMatrices', cat, 'matrix', i, j], im.matrix[i][j])}</td>`
      : `<td class="n help">${i === j ? '1' : fmt(1 / Number(im.matrix[j][i]), 3)}</td>`)).join('')}<td class="n">${pct(res.w[i])}</td></tr>`).join('');
    return `<h3>Indicadores de ${esc(catName(cat))} <span class="cr ${res.consistent ? '' : 'bad'}">(CR ${fmt(res.cr, 4)}, ${res.consistent ? 'consistente' : 'revisar'})</span></h3>
      <div class="table-wrap"><table class="data"><tr><th></th>${im.codes.map(c => `<th>${esc(c)}</th>`).join('')}<th class="n">Peso</th></tr>${rows}</table></div>`;
  }).join('');
  const fees = Object.entries(p.fees).map(([c, o]) => `<tr><td>${c}</td><td><div class="filters">${Object.entries(o).map(([k, v]) => `<div><label>${esc(k)}</label>${numCell(['params', 'fees', c, k], v)}</div>`).join('')}</div></td></tr>`).join('');

  $('#params-body').innerHTML = `
    <h3>Peso de cada criterio según el objetivo del promotor</h3>
    <div class="table-wrap"><table class="data"><tr><th>Objetivo</th>${CRITERIA.map(k => `<th>${esc(d.texts.criteria[k].label)}</th>`).join('')}<th class="n">Suma</th></tr>${cwRows}</table></div>
    ${certTable('Alineación con la normativa mexicana (0 no evalúa, 1 baja, 2 media, 3 alta)', p.normAlignment, ['params', 'normAlignment'])}
    ${certTable('Facilidad, reconocimiento en México y exigencia técnica (0–1)',
      { 'Facilidad técnica y documental': p.ease, 'Reconocimiento en el mercado mexicano': p.marketMX, 'Exigencia técnica': p.rigor }, ['params', '__triple'])}
    ${certTable('Costos indirectos estimados (USD)', { 'Fijo por proyecto (USD)': p.indirectFixed, 'Variable por m² (USD/m²)': p.indirectPerM2 }, ['params', '__indirect'], d.texts.indirectNote)}
    ${certTable('Inversión y reconocimiento internacional (0–1) según el objetivo', p.investment, ['params', 'investment'])}
    ${certTable('Incentivos según la tipología (0–1)', p.incentives, ['params', 'incentives'])}
    <h3>Ajuste del agua por estrés hídrico</h3>
    <div class="grid2"><div><table class="data"><tr><th>Nivel de estrés del acuífero</th><th>Índice</th></tr>
      ${Object.entries(p.stressIndex).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${numCell(['params', 'stressIndex', k], v)}</td></tr>`).join('')}</table></div>
      <div><table class="data"><tr><th>Región AHP</th><th>Nivel de referencia</th><th class="n">Media real de las celdas</th></tr>
      ${REGIONS.map(r => `<tr><td>${esc(r)}</td><td>${numCell(['params', 'referenceLevel', r], p.referenceLevel[r])}</td><td class="n">${fmt(means[r], 2)}</td></tr>`).join('')}</table>
      <div class="filters" style="margin-top:12px"><div><label>Sensibilidad del ajuste</label>${numCell(['params', 'sensitivity'], p.sensitivity)}</div>
      <div><label>Umbral de empate técnico (pts)</label>${numCell(['params', 'tieThreshold'], p.tieThreshold)}</div></div></div></div>
    <h3>Juicios por pares entre categorías (escala de Saaty)</h3>
    <p class="help wide">${esc(d.ahp.saatyScale)}</p>
    <div class="table-wrap"><table class="data"><tr><th>Par (izquierda vs derecha)</th>${REGIONS.map(r => `<th>${esc(r)}</th>`).join('')}</tr>${pairRows}<tr><td>Consistencia</td>${regionCR}</tr></table></div>
    ${indBlocks}
    <h3>Tarifas oficiales (hoja COSTOS)</h3>
    <table class="data">${fees}</table>`;
}

function onParamEdit(e) {
  const el = e.target.closest('[data-path]'); if (!el) return;
  const path = realPath(JSON.parse(el.dataset.path));
  const v = parseNum(el.value);
  if (!Number.isFinite(v) || (path[0] !== 'params' && v <= 0)) { el.style.outline = '2px solid var(--bad)'; return; }
  setPath(S.model, path, v);
  afterModelChange();
}

function afterModelChange() {
  if (JSON.stringify(S.model) === JSON.stringify(S.base)) { try { localStorage.removeItem(LS_MODEL); } catch { /* */ } }
  else save(LS_MODEL, S.model);
  S.cells = null;
  recompute();
  if (S.tab === 'params') renderParams();
}

function downloadParams() {
  const blob = new Blob([JSON.stringify(S.model, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'parametros_herramienta.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importParams(e) {
  const file = e.target.files[0]; if (!file) return;
  file.text().then(t => {
    const m = validModel(JSON.parse(t), S.data);
    if (!m) throw new Error('formato');
    S.model = m; afterModelChange();
  }).catch(() => alert('Este archivo no tiene el formato de parámetros de la herramienta. Usa uno descargado desde esta pestaña.'));
  e.target.value = '';
}

init().catch(err => {
  console.error(err);
  const msg = 'No se pudieron cargar los datos. Si abriste index.html con doble clic, inicia un servidor local (instrucciones en el README).';
  const box = $('#loading') || $('#results');
  if (box) box.textContent = msg;
});
