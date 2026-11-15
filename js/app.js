// Interfaz de la herramienta. Toda la lógica de cálculo está en engine.js.
import {
  CATS, CERTS, REGIONS, compute, defaultModel, gridStress, regionMeans, stateSummary,
  ahpWeights, regionMatrix, reciprocalMatrix, priorityOf,
} from './engine.js';

const S = { data: null, grid: null, model: null, base: null, input: null, result: null, cells: null, map: null, marker: null, tab: 'tool', refTab: 'req' };
const $ = sel => document.querySelector(sel);
const LS_INPUT = 'tfm-cert-input-v1';
const LS_MODEL = 'tfm-cert-model-v1';

// ---------- utilidades ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (d) => new Intl.NumberFormat('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt = (n, d = 2) => (n == null || Number.isNaN(n) ? '—' : nf(d).format(n));
const pct = (n, d = 1) => (n == null || Number.isNaN(n) ? '—' : nf(d).format(n * 100) + ' %');
const usd = n => (n == null ? '—' : '$' + nf(0).format(n));
const multiline = s => esc(s).replace(/\n/g, '<br>');
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
const certShort = { LEED: 'LEED', BREEAM: 'BREEAM', EDGE: 'EDGE' };

// ---------- arranque ----------
async function init() {
  const [data, grid] = await Promise.all([
    fetch('data/base.json').then(r => r.json()),
    fetch('data/grid.json').then(r => r.json()),
  ]);
  S.data = data; S.grid = grid;
  S.base = defaultModel(data);
  S.model = load(LS_MODEL) || defaultModel(data);
  S.input = { ...data.example, ...(load(LS_INPUT) || {}) };
  $('#src-file').textContent = data.source;

  fillSelect('#in-typology', data.typologies);
  fillSelect('#in-objective', data.objectives);
  const citySel = $('#in-city');
  [...data.cities].sort((a, b) => a.name.localeCompare(b.name, 'es')).forEach((c, i) => {
    const o = document.createElement('option');
    o.value = `${c.lat},${c.lon}`; o.textContent = `${c.name}, ${c.state}`;
    citySel.appendChild(o); void i;
  });
  writeInputs();
  bind();
  $('#loading').remove();
  showTab(TAB_HASH[location.hash.slice(1)] || 'tool');
  recompute();
}

function fillSelect(sel, items) {
  $(sel).innerHTML = items.map(v => `<option>${esc(v)}</option>`).join('');
}

function writeInputs() {
  const i = S.input;
  $('#in-lat').value = i.lat; $('#in-lon').value = i.lon;
  $('#in-typology').value = i.typology; $('#in-area').value = i.area; $('#in-units').value = i.units;
  $('#in-usgbc').value = i.usgbc; $('#in-budget').value = i.budget ?? ''; $('#in-objective').value = i.objective;
}

function readInputs() {
  const b = $('#in-budget').value;
  S.input = {
    lat: Number($('#in-lat').value), lon: Number($('#in-lon').value),
    typology: $('#in-typology').value, area: Number($('#in-area').value), units: Number($('#in-units').value),
    usgbc: $('#in-usgbc').value, budget: b === '' ? '' : Number(b), objective: $('#in-objective').value,
  };
  save(LS_INPUT, S.input);
}

function validate(i) {
  const e = [];
  if (!(i.lat >= 14 && i.lat <= 33)) e.push('La latitud debe estar entre 14 y 33 °N.');
  if (!(i.lon >= -119 && i.lon <= -86)) e.push('La longitud debe estar entre −119 y −86 (negativa).');
  if (!(i.area > 0)) e.push('Indica la superficie construida.');
  if (!(i.units >= 0)) e.push('Indica el número de departamentos.');
  return e;
}

function bind() {
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('.inputs').addEventListener('input', e => {
    if (e.target.id === 'in-city') return;
    readInputs(); recompute();
  });
  $('#in-city').addEventListener('change', e => {
    if (!e.target.value) return;
    const [lat, lon] = e.target.value.split(',').map(Number);
    $('#in-lat').value = lat; $('#in-lon').value = lon;
    readInputs(); recompute();
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'print') window.print();
    if (act === 'example') { S.input = { ...S.data.example }; save(LS_INPUT, S.input); writeInputs(); recompute(); }
    if (act === 'reset') { S.model = defaultModel(S.data); afterModelChange(); }
    if (act === 'export-params') downloadParams();
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

const TAB_HASH = { herramienta: 'tool', estados: 'states', consulta: 'ref', parametros: 'params' };
function showTab(t) {
  S.tab = t;
  const h = Object.keys(TAB_HASH).find(k => TAB_HASH[k] === t);
  if (location.hash.slice(1) !== h) history.replaceState(null, '', '#' + h);
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach(s => { s.hidden = s.id !== 'tab-' + t; });
  if (t === 'tool') { initMap(); setTimeout(() => S.map && S.map.invalidateSize(), 50); }
  if (t === 'states') renderStates();
  if (t === 'ref') renderRef();
  if (t === 'params') renderParams();
}

function initMap() {
  if (S.map || typeof L === 'undefined') return;
  S.map = L.map('map', { scrollWheelZoom: false }).setView([23.6, -102.5], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; OpenStreetMap',
  }).addTo(S.map);
  S.marker = L.marker([S.input.lat, S.input.lon]).addTo(S.map);
  S.map.on('click', ev => {
    $('#in-lat').value = ev.latlng.lat.toFixed(4);
    $('#in-lon').value = ev.latlng.lng.toFixed(4);
    $('#in-city').value = '';
    readInputs(); recompute();
  });
}

// ---------- cálculo ----------
function recompute() {
  const errs = validate(S.input);
  $('#in-errors').innerHTML = errs.map(esc).join('<br>');
  if (S.marker && Number.isFinite(S.input.lat) && Number.isFinite(S.input.lon)) S.marker.setLatLng([S.input.lat, S.input.lon]);
  if (errs.length) { $('#results').innerHTML = `<div class="panel warning">${errs.map(esc).join('<br>')}</div>`; return; }
  S.result = compute(S.input, S.model, S.data, S.grid);
  renderResults();
  if (S.tab === 'states') renderStates();
  if (S.tab === 'ref' && S.refTab === 'req') renderRefTable();
  $('#modified').hidden = JSON.stringify(S.model) === JSON.stringify(S.base);
}

// ---------- resultados ----------
function renderResults() {
  const r = S.result, d = S.data;
  const cw = S.model.params.criteriaWeights[r.input.objective];
  const html = [];
  if (r.warning) html.push(`<div class="warning">${esc(r.warning)}</div>`);

  // Recomendación
  html.push(`<section class="hero c-${r.recCert}">
    <div class="label">Certificación recomendada</div>
    <div class="rec"><span class="dot"></span>${esc(r.recommended)}</div>
    <p class="msg">${esc(r.message)}</p>
    <dl>
      <dt>Alternativa (2.ª opción)</dt><dd>${esc(r.alternative)}</dd>
      <dt>Ventaja sobre la 2.ª</dt><dd>${r.advantage == null ? '—' : fmt(r.advantage, 1) + ' puntos'}</dd>
      <dt>Incentivos para «${esc(r.input.typology)}»</dt><dd>${esc(r.incentivesText)}</dd>
    </dl>
  </section>`);

  // Puntuaciones
  const rows = CERTS.map(c => {
    const p = r.per[c];
    const fit = p.fits === 'Sí' ? '<span class="badge ok">Cabe en el presupuesto</span>'
      : p.fits === 'No' ? '<span class="badge no">Excede el presupuesto</span>' : '<span class="badge">Sin presupuesto</span>';
    return `<div class="score-row c-${c}">
      <div class="name"><span class="dot"></span>${esc(d.certNames[c])}</div>
      <div class="bar"><span style="width:${Math.max(0, Math.min(100, p.score))}%"></span></div>
      <div class="val">${fmt(p.score, 1)}</div>
      <div class="meta">Posición ${p.rank} · costo total estimado ${usd(p.total)} ${fit}</div>
    </div>`;
  }).join('');
  html.push(`<section class="panel"><h2><span class="num">4</span> Puntuación (0–100) según el objetivo «${esc(r.input.objective)}»</h2>
    <div class="scores">${rows}</div>
    <details><summary>Ver el desglose por criterio y los costos</summary>${breakdownTable(r, cw)}</details>
  </section>`);

  html.push(`<div class="grid2">${contextPanel(r)}${ahpPanel(r)}</div>`);
  html.push(requirementsPanel(r));
  $('#results').innerHTML = html.join('');
}

function breakdownTable(r, cw) {
  const t = S.data.texts.criteria;
  const keys = ['coincidencia', 'cobertura', 'alineacion', 'viabilidad', 'incentivos', 'inversion', 'exigencia'];
  const head = `<tr><th>Criterio</th>${CERTS.map(c => `<th class="n">${certShort[c]}</th>`).join('')}<th class="n">Peso</th></tr>`;
  const body = keys.map(k => `<tr><td>${esc(t[k].label)}<div class="hint">${esc(t[k].what)}</div></td>
      ${CERTS.map(c => `<td class="n">${pct(r.per[c][k])}</td>`).join('')}<td class="n">${pct(cw[k], 0)}</td></tr>`).join('');
  const money = [
    ['Tarifas oficiales (USD)', c => usd(r.per[c].fees.total)],
    ['Costos indirectos estimados (USD)', c => usd(r.per[c].indirect)],
    ['Costo total estimado (USD)', c => `<strong>${usd(r.per[c].total)}</strong>`],
    ['¿Cabe en el presupuesto?', c => esc(r.per[c].fits)],
  ].map(([l, f]) => `<tr><td>${l}</td>${CERTS.map(c => `<td class="n">${f(c)}</td>`).join('')}<td></td></tr>`).join('');
  const total = `<tr class="total"><td>Puntuación (0–100)</td>${CERTS.map(c => `<td class="n">${fmt(r.per[c].score, 2)}</td>`).join('')}<td class="n">${pct(keys.reduce((s, k) => s + Number(cw[k]), 0), 0)}</td></tr>`;
  const fees = CERTS.map(c => `<li><strong>${certShort[c]}:</strong> registro ${usd(r.per[c].fees.registration)} + certificación ${usd(r.per[c].fees.certification)}. ${esc(S.data.texts.feeComments[c])}</li>`).join('');
  return `<div class="table-wrap"><table class="data">${head}${body}${total}${money}</table></div>
    <ul class="hint">${fees}<li>${esc(S.data.texts.indirectNote)}</li></ul>`;
}

function contextPanel(r) {
  const c = r.ctx;
  const aq = c.aquifer;
  const kv = [
    ['Estado', esc(c.state)],
    ['Ciudad más cercana', esc(c.cityLabel)],
    ['Clima Köppen-Geiger (Beck et al., 2023)', `<strong>${esc(c.koppen)}</strong> · ${esc(c.koppenName)}`],
    ['Contraste Köppen (Rubel, 2017)', esc(c.rubel)],
    ['Región AHP usada', `<strong>${esc(r.region)}</strong>`],
    ['Acuífero (CONAGUA)', esc(c.aquiferLabel)],
    ['Condición (DOF 2023)', esc(c.condition)],
    ['Disponibilidad media anual', aq ? `${fmt(aq.dma, 1)} hm³/año` : '—'],
    ['Índice de explotación (VEAS / recarga neta)', aq && typeof aq.index === 'number' ? fmt(aq.index, 2) : '—'],
    ['Nivel de estrés del acuífero', `<strong>${esc(c.level)}</strong>`],
    ['Región hidrológico-administrativa', `${esc(c.rhaLabel)}${c.rhaPressure != null ? ` · presión ${pct(c.rhaPressure)} (${esc(c.rhaClass)})` : ''}`],
    ['Implicación para el diseño', esc(c.implication)],
  ];
  const kl = c.koppenLegend;
  return `<section class="panel"><h2><span class="num">2</span> Contexto del sitio</h2>
    <dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <details><summary>Más detalle del clima y del dato</summary>
      <div class="more">${kl ? `<p><strong>${esc(kl.code)}</strong> — ${esc(kl.criterion)}</p><p>${esc(kl.implication)}</p>` : ''}
      <p>Clave de malla: <code>${esc(c.key)}</code> · Origen del dato del acuífero: ${esc(c.aquiferOrigin)}</p></div>
    </details>
  </section>`;
}

function ahpPanel(r) {
  const rows = CATS.map((cat, i) => {
    const ch = (r.w[i] - r.wBase[i]) * 100;
    return `<tr><td>${esc(cat)}</td><td class="n">${pct(r.wBase[i])}</td>
      <td><div class="bar"><span style="width:${(r.w[i] * 100 / 0.5).toFixed(1)}%"></span></div></td>
      <td class="n"><strong>${pct(r.w[i])}</strong></td>
      <td class="n ${ch >= 0 ? 'pos' : 'negv'}">${ch >= 0 ? '+' : ''}${fmt(ch, 1)}</td></tr>`;
  }).join('');
  const m = r.siteAHP;
  const matrix = `<table class="data"><tr><th></th>${CATS.map(c => `<th class="n">${esc(c.slice(0, 6))}.</th>`).join('')}<th class="n">Peso</th></tr>
    ${m.matrix.map((row, i) => `<tr><td>${esc(CATS[i])}</td>${row.map(v => `<td class="n">${fmt(v, 3)}</td>`).join('')}<td class="n">${pct(m.w[i])}</td></tr>`).join('')}</table>`;
  const just = S.model.pairs.map(p => `<li><strong>${esc(p.a)} vs ${esc(p.b)}</strong> = ${esc(showNum(Number(p.values[r.region])))} — ${esc(p.why[r.region])}</li>`).join('');
  return `<section class="panel"><h2><span class="num">3</span> Pesos AHP del sitio</h2>
    <p class="hint">Juicios de la región ${esc(r.region)} + ajuste del AGUA por el estrés del acuífero.</p>
    <dl class="kv">
      <dt>Índice de estrés (1 Escasa – 5 Déficit)</dt><dd>${r.stressIndex ?? '—'}</dd>
      <dt>Nivel de referencia de la región</dt><dd>${fmt(r.refLevel, 1)}</dd>
      <dt>Factor de ajuste del agua (f)</dt><dd>${fmt(r.f, 3)} <span class="hint">= ${fmt(S.model.params.sensitivity, 2)}^(${r.stressIndex ?? '—'} − ${fmt(r.refLevel, 1)})</span></dd>
      <dt>Consistencia</dt><dd class="cr ${m.consistent ? '' : 'bad'}">λmax ${fmt(m.lambda, 3)} · CI ${fmt(m.ci, 4)} · CR ${fmt(m.cr, 4)} → ${m.consistent ? 'Consistente' : 'REVISAR'}</dd>
    </dl>
    <div class="table-wrap"><table class="data"><tr><th>Categoría</th><th class="n">Base región</th><th style="width:30%"></th><th class="n">Sitio</th><th class="n">Cambio (pts)</th></tr>${rows}</table></div>
    <details><summary>Ver la matriz de juicios ajustada (fila vs columna)</summary><div class="table-wrap">${matrix}</div></details>
    <details><summary>Justificación de los juicios de la región ${esc(r.region)}</summary><ul class="more">${just}</ul></details>
  </section>`;
}

function reqItem(q) {
  return `<div class="req"><div class="t">${esc(q.code)} · ${esc(q.name)}</div>
    <div class="m">Peso global ${pct(q.globalWeight, 2)} · <span class="badge ${q.priority === 'Alta' ? 'alta' : ''}">${esc(q.priority)}</span> · Indicador ${esc(q.indicator)} · ${esc(q.points ?? '')}</div>
    <div class="m">¿Obligatorio? ${esc(q.mandatory)}</div>
    <details><summary>Dificultad según la ubicación</summary><div class="more">${esc(q.difficulty)}${q.nom ? `<br><strong>Normativa MX:</strong> ${esc(q.nom)}` : ''}</div></details>
  </div>`;
}

function requirementsPanel(r) {
  const cols = CERTS.map(c => {
    const list = r.topRequirements[c];
    const isRec = c === r.recCert;
    return `<div class="req-col c-${c} ${isRec ? 'rec' : ''}">
      <h3><span><span class="dot"></span>${esc(S.data.certNames[c])}</span>${isRec ? '<span class="badge ok">Recomendada</span>' : ''}</h3>
      ${list.slice(0, 5).map(reqItem).join('')}
      <details><summary>Ver los ${list.length} requisitos ordenados</summary>${list.slice(5).map(reqItem).join('')}</details>
    </div>`;
  }).join('');
  return `<section class="panel"><h2><span class="num">5</span> Requisitos de mayor prioridad en esta ubicación</h2>
    <p class="hint">5 por certificación, según el peso global AHP del sitio (peso de la categoría × peso del indicador). Umbrales: Alta ≥ 6 % · Media ≥ 3 % · Baja &lt; 3 %. Se resalta la certificación recomendada.</p>
    <div class="reqs">${cols}</div></section>`;
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
  $('#states-note').innerHTML = `Pesos del estado = pesos de su región dominante con el AGUA ajustada por el índice de estrés medio de sus celdas. Los criterios económicos, de incentivos, inversión y exigencia, el objetivo («${esc(r.input.objective)}») y el filtro de presupuesto se toman del proyecto actual de la pestaña Herramienta, igual que en la hoja RESUMEN_ESTADOS.`;
  const count = c => rows.filter(x => x.recommended === c).length;
  const ties = rows.filter(x => x.advantage != null && x.advantage < S.model.params.tieThreshold).length;
  $('#states-summary').innerHTML = CERTS.map(c => `<span class="chip c-${c}"><span class="dot"></span>${certShort[c]}: ${count(c)} estados</span>`).join('') +
    `<span class="chip">Empate técnico (&lt; ${S.model.params.tieThreshold} pts): ${ties}</span>`;
  const cols = [
    ['state', 'Estado', x => esc(x.state)], ['cells', 'Celdas', x => x.cells, 1],
    ['pA', '% Tropical', x => pct(x.pA, 0), 1], ['pB', '% Árido', x => pct(x.pB, 0), 1], ['pC', '% Templado', x => pct(x.pC, 0), 1],
    ['dominant', 'Región dominante', x => esc(x.dominant)], ['over', '% celdas sobreexplotadas', x => pct(x.over, 0), 1],
    ['meanIdx', 'Índice de estrés medio', x => fmt(x.meanIdx, 2), 1], ['f', 'Factor f', x => fmt(x.f, 2), 1],
    ...CATS.map((c, i) => [`w${i}`, `Peso ${c.slice(0, 6)}.`, x => pct(x.w[i]), 1]),
    ...CERTS.map(c => [c, certShort[c], x => fmt(x.scores[c], 1), 1]),
    ['recommended', 'Recomendada', x => `<span class="c-${x.recommended}"><span class="dot"></span>${x.recommended}</span>`],
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

function renderRef() {
  $('#ref-tabs').innerHTML = REF_TABS.map(([k, l]) => `<button data-sub="${k}" class="${S.refTab === k ? 'active' : ''}">${l}</button>`).join('');
  const d = S.data;
  const search = '<label>Buscar<input type="search" id="ref-q" placeholder="Texto, código, norma…"></label>';
  let html = '';
  if (S.refTab === 'req') {
    html = `<div class="filters">${search}
      <label>Certificación<select id="ref-cert"><option value="">Todas</option>${CERTS.map(c => `<option>${c}</option>`).join('')}</select></label>
      <label>Categoría<select id="ref-cat"><option value="">Todas</option>${CATS.map(c => `<option>${c}</option>`).join('')}</select></label>
      <label>Prioridad en el sitio actual<select id="ref-pri"><option value="">Todas</option><option>Alta</option><option>Media</option><option>Baja</option></select></label>
    </div><div class="table-wrap" id="ref-table"></div>`;
  } else if (S.refTab === 'cert') {
    html = `<label>Aspecto<select id="ref-aspect">${d.certificaciones.aspects.map(a => `<option>${esc(a)}</option>`).join('')}</select></label><div id="ref-table"></div>`;
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
    box.innerHTML = `<p class="hint">${list.length} requisitos. El peso global y la prioridad corresponden al sitio de la pestaña Herramienta.</p>
      <table class="data"><thead><tr><th>Certificación</th><th>Categoría</th><th>Código</th><th>Nombre</th><th>Tipo</th><th>Puntos</th><th>¿Obligatorio?</th><th>Indicador</th><th class="n">Peso global</th><th>Prioridad</th></tr></thead><tbody>
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
      <p class="hint">${esc(d.stressNote)}</p>
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
  const prop = regs.map(({ r, w }) => `<tr><td>PROPUESTA México – ${esc(r)}</td>${w.w.map(x => `<td class="n">${pct(x)}</td>`).join('')}<td>CR ${fmt(w.cr, 4)}</td></tr>`).join('');
  return `<p class="more">${esc(a.method)}</p>
    <h3>Criterios para dar más peso a una categoría</h3>
    ${genericTable({ headers: ['Criterio', 'Qué dicen los artículos', 'Fuente', 'Cómo se aplica en México', 'Dato de México y fuente'],
      rows: a.criteria.map(c => [c.title, c.literature, c.source, c.mexico, c.data]) }, '')}
    <h3>Comparación con los pesos de otros sistemas</h3>
    <div class="table-wrap"><table class="data"><tr><th>Sistema</th>${CATS.map(c => `<th class="n">${esc(c)}</th>`).join('')}<th>Fuente</th></tr>${sys}${prop}</table></div>
    <p class="hint">${esc(a.matchNote)}</p>
    <h3>Indicadores dentro de cada categoría</h3><p class="hint">${esc(a.indicatorRule)}</p>
    ${genericTable({ headers: ['Código', 'Categoría', 'Indicador', 'Requisitos que agrupa', 'Por qué'],
      rows: a.indicators.map(i => [i.code, i.category, i.name, i.groups, i.why]) }, '')}
    <h3>Conclusión: ¿qué debería pesar más en México?</h3>
    ${a.conclusions.map(c => `<p><strong>${esc(c.title)}</strong><br><span class="more">${esc(c.text)}</span></p>`).join('')}`;
}

// ---------- parámetros ----------
const P = (...path) => `data-path='${esc(JSON.stringify(path))}'`;
function getPath(obj, path) { return path.reduce((o, k) => o[k], obj); }
function setPath(obj, path, v) { const last = path[path.length - 1]; getPath(obj, path.slice(0, -1))[last] = v; }
function numCell(path, v) {
  const real = realPath(path);
  const changed = JSON.stringify(getPath(S.base, real)) !== JSON.stringify(v);
  const frac = real[0] !== 'params'; // fracciones solo en los juicios AHP
  return `<input ${P(...path)} value="${esc(showNum(v, frac))}" class="${changed ? 'changed' : ''}" inputmode="decimal">`;
}

function certTable(title, rowsObj, pathBase, note) {
  const rows = Object.entries(rowsObj).map(([k, v]) => `<tr><td>${esc(k)}</td>${CERTS.map(c => `<td>${numCell([...pathBase, k, c], v[c])}</td>`).join('')}</tr>`).join('');
  return `<h3>${esc(title)}</h3>${note ? `<p class="hint">${esc(note)}</p>` : ''}<div class="table-wrap"><table class="data"><tr><th></th>${CERTS.map(c => `<th>${c}</th>`).join('')}</tr>${rows}</table></div>`;
}

function renderParams() {
  const m = S.model, p = m.params, d = S.data;
  const keys = ['coincidencia', 'cobertura', 'alineacion', 'viabilidad', 'incentivos', 'inversion', 'exigencia'];
  const cwRows = d.objectives.map(o => {
    const sum = keys.reduce((s, k) => s + Number(p.criteriaWeights[o][k]), 0);
    return `<tr><td>${esc(o)}</td>${keys.map(k => `<td>${numCell(['params', 'criteriaWeights', o, k], p.criteriaWeights[o][k])}</td>`).join('')}
      <td class="n ${Math.abs(sum - 1) > 1e-6 ? 'negv' : ''}">${pct(sum, 0)}</td></tr>`;
  }).join('');
  const means = regionMeans(S.cells || (S.cells = gridStress(m, d, S.grid)));
  const regionBlocks = REGIONS.map(r => {
    const res = ahpWeights(regionMatrix(m.pairs, r));
    return `<td class="cr ${res.consistent ? '' : 'bad'}">CR ${fmt(res.cr, 4)}<br>${res.consistent ? 'Consistente' : 'REVISAR'}</td>`;
  }).join('');
  const pairRows = m.pairs.map((pr, i) => `<tr><td>${esc(pr.a)} vs ${esc(pr.b)}</td>${REGIONS.map(r => `<td>${numCell(['pairs', i, 'values', r], pr.values[r])}</td>`).join('')}</tr>`).join('');
  const indBlocks = Object.entries(m.indicatorMatrices).map(([cat, im]) => {
    const res = ahpWeights(reciprocalMatrix(im.matrix));
    const n = im.codes.length;
    const rows = im.codes.map((code, i) => `<tr><td>${esc(code)}</td>${im.codes.map((_, j) => j > i ? `<td>${numCell(['indicatorMatrices', cat, 'matrix', i, j], im.matrix[i][j])}</td>` : `<td class="n hint">${i === j ? '1' : fmt(1 / Number(im.matrix[j][i]), 3)}</td>`).join('')}<td class="n">${pct(res.w[i])}</td></tr>`).join('');
    return `<h3>Indicadores · ${esc(cat)} <span class="cr ${res.consistent ? '' : 'bad'}">(CR ${fmt(res.cr, 4)} · ${res.consistent ? 'Consistente' : 'REVISAR'})</span></h3>
      <div class="table-wrap"><table class="data"><tr><th></th>${im.codes.map(c => `<th>${esc(c)}</th>`).join('')}<th class="n">Peso</th></tr>${rows}</table></div>${n ? '' : ''}`;
  }).join('');
  const fees = Object.entries(p.fees).map(([c, o]) => `<tr><td>${c}</td><td>${Object.entries(o).map(([k, v]) => `<label style="display:inline-block;width:150px;margin-right:8px">${esc(k)}${numCell(['params', 'fees', c, k], v)}</label>`).join('')}</td></tr>`).join('');

  $('#params-body').innerHTML = `
    <h3>Peso de cada criterio según el objetivo del promotor</h3>
    <div class="table-wrap"><table class="data"><tr><th>Objetivo</th>${keys.map(k => `<th>${esc(d.texts.criteria[k].label)}</th>`).join('')}<th class="n">Suma</th></tr>${cwRows}</table></div>
    ${certTable('Alineación con la normativa mexicana (0 = no evalúa · 1 baja · 2 media · 3 alta)', p.normAlignment, ['params', 'normAlignment'])}
    ${certTable('Facilidad técnica y documental · Reconocimiento en el mercado mexicano · Exigencia técnica (0–1)',
      { 'Facilidad técnica y documental': p.ease, 'Reconocimiento en el mercado mexicano': p.marketMX, 'Exigencia técnica': p.rigor }, ['params', '__triple'])}
    ${certTable('Costos indirectos estimados (USD)', { 'Fijo por proyecto (USD)': p.indirectFixed, 'Variable por m² (USD/m²)': p.indirectPerM2 }, ['params', '__indirect'], d.texts.indirectNote)}
    ${certTable('Atracción de inversión y reconocimiento internacional (0–1) según el objetivo', p.investment, ['params', 'investment'])}
    ${certTable('Incentivos según tipología (0–1)', p.incentives, ['params', 'incentives'])}
    <h3>Ajuste del AGUA por estrés hídrico</h3>
    <div class="grid2"><div><table class="data"><tr><th>Nivel de estrés del acuífero</th><th>Índice</th></tr>
      ${Object.entries(p.stressIndex).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${numCell(['params', 'stressIndex', k], v)}</td></tr>`).join('')}</table></div>
      <div><table class="data"><tr><th>Región AHP</th><th>Nivel de referencia</th><th class="n">Media real de las celdas (control)</th></tr>
      ${REGIONS.map(r => `<tr><td>${esc(r)}</td><td>${numCell(['params', 'referenceLevel', r], p.referenceLevel[r])}</td><td class="n">${fmt(means[r], 2)}</td></tr>`).join('')}</table>
      <label style="margin-top:10px">Sensibilidad del ajuste (factor por nivel de estrés)${numCell(['params', 'sensitivity'], p.sensitivity)}</label>
      <label>Umbral de empate técnico (puntos)${numCell(['params', 'tieThreshold'], p.tieThreshold)}</label></div></div>
    <h3>Juicios por pares entre categorías (escala de Saaty)</h3>
    <p class="hint">${esc(d.ahp.saatyScale)}</p>
    <div class="table-wrap"><table class="data"><tr><th>Par (izq. vs der.)</th>${REGIONS.map(r => `<th>${esc(r)}</th>`).join('')}</tr>${pairRows}<tr><td>Consistencia</td>${regionBlocks}</tr></table></div>
    ${indBlocks}
    <h3>Tarifas oficiales (hoja COSTOS)</h3>
    <table class="data">${fees}</table>`;
}

// las filas "virtuales" de certTable apuntan a objetos reales
function realPath(path) {
  if (path[1] === '__triple') return ['params', { 'Facilidad técnica y documental': 'ease', 'Reconocimiento en el mercado mexicano': 'marketMX', 'Exigencia técnica': 'rigor' }[path[2]], path[3]];
  if (path[1] === '__indirect') return ['params', path[2].startsWith('Fijo') ? 'indirectFixed' : 'indirectPerM2', path[3]];
  return path;
}
function onParamEdit(e) {
  const el = e.target.closest('[data-path]'); if (!el) return;
  const path = realPath(JSON.parse(el.dataset.path));
  const v = parseNum(el.value);
  if (!Number.isFinite(v) || (path[0] !== 'params' && v <= 0)) { el.style.outline = '2px solid var(--bad)'; return; }
  setPath(S.model, path, v);
  afterModelChange(false);
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
    const m = JSON.parse(t);
    if (!m.params || !m.pairs || !m.indicatorMatrices) throw new Error('formato');
    S.model = m; afterModelChange(true);
  }).catch(() => alert('El archivo no tiene el formato de parámetros de esta herramienta.'));
  e.target.value = '';
}

init().catch(err => {
  console.error(err);
  $('#loading').textContent = 'No se pudieron cargar los datos. Si abriste el archivo directamente, usa un servidor local (ver README).';
});
