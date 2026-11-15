// =====================================================================
//  Motor de cálculo de la herramienta de selección de certificación.
//  Reproduce las fórmulas de HERRAMIENTA_9NOV_v3_1.xlsx. Cada función
//  indica la hoja y las celdas que replica.
//  Funciona en el navegador y en Node (tools/verify.mjs).
// =====================================================================

export const CATS = ['TRANSPORTE', 'ECOLOGÍA', 'AGUA', 'ENERGÍA', 'MATERIALES'];
export const CERTS = ['LEED', 'BREEAM', 'EDGE'];
export const REGIONS = ['Templado (C)', 'Árido (B)', 'Tropical (A)'];
const WATER = 2; // índice de AGUA en CATS
const RI = { 3: 0.58, 4: 0.9, 5: 1.12 }; // índice aleatorio de Saaty
export const OUTSIDE = 'Fuera de México o en el mar';
export const PRIORITY_HIGH = 0.06;
export const PRIORITY_MID = 0.03;

// ROUND de Excel (redondea .5 alejándose de cero)
/** Valores editables por defecto (tal como están en el Excel). */
export function defaultModel(data) {
  return JSON.parse(JSON.stringify({
    params: data.params, pairs: data.ahp.pairs, indicatorMatrices: data.ahp.indicatorMatrices,
  }));
}

export function excelRound(x, digits = 0) {
  const p = 10 ** digits;
  const v = Math.abs(x) * p;
  return Math.sign(x) * Math.round(v + 1e-9) / p;
}

export function geomean(arr) {
  return Math.exp(arr.reduce((s, v) => s + Math.log(v), 0) / arr.length);
}

/** Pesos AHP por media geométrica + λmax, CI y CR (PESOS AHP, filas 38–43). */
export function ahpWeights(matrix) {
  const n = matrix.length;
  const gm = matrix.map(geomean);
  const sum = gm.reduce((a, b) => a + b, 0);
  const w = gm.map(g => g / sum);
  const aw = matrix.map((row, i) => row.reduce((s, v, j) => s + v * w[j], 0) / w[i]);
  const lambda = aw.reduce((a, b) => a + b, 0) / n;
  const ci = (lambda - n) / (n - 1);
  const cr = ci / RI[n];
  return { matrix, gm, w, aw, lambda, ci, cr, consistent: cr < 0.1 };
}

/** Completa la matriz a partir del triángulo superior (la parte inferior = 1/x). */
export function reciprocalMatrix(upper) {
  const n = upper.length;
  const m = [];
  for (let i = 0; i < n; i++) {
    m.push([]);
    for (let j = 0; j < n; j++) {
      if (i === j) m[i].push(1);
      else if (j > i) m[i].push(Number(upper[i][j]));
      else m[i].push(1 / Number(upper[j][i]));
    }
  }
  return m;
}

/** Matriz de juicios entre categorías de una región (PESOS AHP, filas 25–34 → 38–60). */
export function regionMatrix(pairs, region) {
  const up = CATS.map(() => CATS.map(() => 1));
  for (const p of pairs) {
    const i = CATS.indexOf(p.a), j = CATS.indexOf(p.b);
    up[i][j] = Number(p.values[region]);
  }
  return reciprocalMatrix(up);
}

/** Matriz del sitio: la fila AGUA × f y la columna AGUA ÷ f (HERRAMIENTA C33:G37). */
export function siteMatrix(base, f) {
  return base.map((row, i) => row.map((v, j) => {
    if (i === j) return v;
    if (i === WATER) return v * f;
    if (j === WATER) return v / f;
    return v;
  }));
}

export function priorityOf(w) {
  return w >= PRIORITY_HIGH ? 'Alta' : w >= PRIORITY_MID ? 'Media' : 'Baja';
}

export function regionOfKoppen(k) {
  if (!k || k === '—') return 'Templado (C)';
  const g = k[0];
  return g === 'A' ? 'Tropical (A)' : g === 'B' ? 'Árido (B)' : 'Templado (C)';
}

export function gridKey(lat, lon) {
  return `${excelRound(lat * 20)}|${excelRound(lon * 20)}`;
}

/** Ciudad más cercana (CLIMA_KOPPEN C12:C13). */
export function nearestCity(lat, lon, cities) {
  const c = Math.cos(lat * Math.PI / 180);
  let best = null, bestD = Infinity;
  for (const city of cities) {
    const d = (city.lat - lat) ** 2 + ((city.lon - lon) * c) ** 2;
    if (d < bestD) { bestD = d; best = city; }
  }
  return { city: best, km: excelRound(Math.sqrt(bestD) * 111.2, 1) };
}

/** Contexto del sitio (CLIMA_KOPPEN sección A + ESTRES_HIDRICO sección A). */
export function siteContext(lat, lon, data, grid) {
  const cell = grid.cells[gridKey(lat, lon)];
  const state = cell ? grid.states[cell[0]] : OUTSIDE;
  const koppen = cell ? grid.koppen[cell[1]] : '—';
  const rubel = cell ? grid.koppen[cell[2]] : '—';
  const aqCode = cell ? cell[3] : null;
  const aq = aqCode != null ? data.aquifers[String(aqCode)] : null;
  const legend = data.koppenLegend.find(k => k.code === koppen);
  const rha = aq ? data.rha.find(r => r.code === aq.rha) : null;
  const level = aq ? aq.level : '—';
  const scale = data.stressScale.find(s => s.level === level);
  const near = nearestCity(lat, lon, data.cities);
  return {
    key: gridKey(lat, lon),
    state,
    outside: state.startsWith('Fuera'),
    koppen,
    koppenName: legend ? legend.name : '—',
    koppenLegend: legend || null,
    rubel,
    city: near.city,
    cityKm: near.km,
    cityLabel: near.city ? `${near.city.name}, ${near.city.state} (≈ ${excelRound(near.km)} km)` : '—',
    aquiferCode: aq ? aqCode : null,
    aquifer: aq,
    aquiferLabel: aq ? `${String(aqCode).padStart(4, '0')} – ${aq.name}` : 'Sin acuífero asignado (isla o mar)',
    aquiferOrigin: cell ? grid.origins[cell[4]] : '—',
    condition: aq ? aq.condition : '—',
    level,
    rha,
    rhaLabel: rha ? `${rha.code} – ${rha.name}` : '—',
    rhaPressure: rha ? rha.pressure / 100 : null,
    rhaClass: rha ? rha.class : '—',
    implication: scale ? scale.implication : '—',
    koppenRegion: regionOfKoppen(koppen),
  };
}

/** Tarifas oficiales (hoja COSTOS). */
export function officialFees(input, fees) {
  const L = fees.LEED, B = fees.BREEAM, E = fees.EDGE;
  const member = input.usgbc === 'Sí';
  const ft2 = input.area * L.ft2PerM2;
  const leedReg = member ? L.regMember : L.regNonMember;
  const leedRev = member ? Math.max(L.reviewMinMember, ft2 * L.reviewRateMember)
                         : Math.max(L.reviewMinNonMember, ft2 * L.reviewRateNonMember);
  const u = input.units;
  const breCert = Math.max(B.certMin, u <= 100 ? u * B.perUnitUpTo100 : 100 * B.perUnitUpTo100 + (u - 100) * B.perUnitOver100);
  const edgeCert = Math.max(E.certMin, input.area * E.perM2);
  return {
    LEED: { registration: leedReg, certification: leedRev, total: leedReg + leedRev },
    BREEAM: { registration: B.registration, certification: breCert, total: B.registration + breCert },
    EDGE: { registration: E.registration, certification: edgeCert, total: E.registration + edgeCert },
  };
}

/** Pesos de los indicadores dentro de cada categoría (PESOS AHP, filas 109–150). */
export function indicatorWeights(indicatorMatrices) {
  const out = {};
  for (const [cat, m] of Object.entries(indicatorMatrices)) {
    const res = ahpWeights(reciprocalMatrix(m.matrix));
    m.codes.forEach((code, i) => { out[code] = { category: cat, inCategory: res.w[i] }; });
    out['__' + cat] = res;
  }
  return out;
}

function pickRecommendation(eligible, totals, certs) {
  const max = Math.max(...eligible);
  const nEligible = eligible.filter(v => v >= 0).length;
  let rec;
  if (max < 0) rec = totals.indexOf(Math.min(...totals));
  else rec = eligible.indexOf(max);
  let advantage = null, alt = null;
  if (nEligible >= 2) {
    const sorted = [...eligible].sort((a, b) => b - a);
    advantage = sorted[0] - sorted[1];
    alt = eligible.findIndex((v, i) => v === sorted[1] && i !== rec);
  }
  return { rec, recCert: certs[rec], advantage, alt: alt != null && alt >= 0 ? certs[alt] : null, max, nEligible };
}

/**
 * Cálculo completo de la hoja HERRAMIENTA.
 * input: {lat, lon, typology, area, units, usgbc, budget, objective, forceRegion?}
 * model: {params, pairs, indicatorMatrices} (valores editables)
 */
export function compute(input, model, data, grid) {
  const P = model.params;
  const ctx = siteContext(input.lat, input.lon, data, grid);
  const region = input.forceRegion || ctx.koppenRegion; // PESOS AHP M12

  // ---- Sección 3: pesos AHP del sitio ----
  const stressIndex = ctx.level in P.stressIndex ? Number(P.stressIndex[ctx.level]) : null; // C27
  const refLevel = Number(P.referenceLevel[region]); // C28
  const f = stressIndex == null ? 1 : Number(P.sensitivity) ** (stressIndex - refLevel); // C29
  const regions = {};
  for (const r of REGIONS) regions[r] = ahpWeights(regionMatrix(model.pairs, r));
  const baseAHP = regions[region];
  const siteAHP = ahpWeights(siteMatrix(baseAHP.matrix, f));
  const wBase = baseAHP.w, w = siteAHP.w;

  // ---- Sección 4: puntuación ----
  const systems = data.ahp.systems.slice(0, 3).map(s => s.weights); // LEED, BREEAM, EDGE
  const fees = officialFees(input, P.fees);
  const cw = P.criteriaWeights[input.objective];
  const per = {};
  const totals = [];
  CERTS.forEach((c, k) => {
    const sw = systems[k];
    const coincidencia = sw.reduce((s, v, i) => s + Math.min(v, w[i]), 0);
    const cobertura = sw.reduce((s, v, i) => s + (v > 0 ? w[i] : 0), 0);
    const num = CATS.reduce((s, cat, i) => s + Number(P.normAlignment[cat][c]) * w[i], 0);
    const alineacion = cobertura > 0 ? num / (3 * cobertura) : 0;
    const indirect = Number(P.indirectFixed[c]) + Number(P.indirectPerM2[c]) * input.area;
    const total = fees[c].total + indirect;
    totals.push(total);
    per[c] = { coincidencia, cobertura, alineacion, fees: fees[c], indirect, total };
  });
  const minTotal = Math.min(...totals);
  const hasBudget = input.budget !== '' && input.budget != null && !Number.isNaN(Number(input.budget));
  CERTS.forEach(c => {
    const r = per[c];
    r.viabilidad = 0.5 * minTotal / r.total + 0.5 * Number(P.ease[c]);
    r.incentivos = 0.5 * Number(P.incentives[input.typology][c]) + 0.5 * Number(P.marketMX[c]);
    r.inversion = Number(P.investment[input.objective][c]);
    r.exigencia = Number(P.rigor[c]);
    r.score = 100 * (r.coincidencia * cw.coincidencia + r.cobertura * cw.cobertura + r.alineacion * cw.alineacion +
      r.viabilidad * cw.viabilidad + r.incentivos * cw.incentivos + r.inversion * cw.inversion + r.exigencia * cw.exigencia);
    r.fits = !hasBudget ? '(sin presupuesto)' : r.total <= Number(input.budget) ? 'Sí' : 'No';
    r.eligible = r.fits === 'No' ? -1 : r.score;
  });
  const scores = CERTS.map(c => per[c].score);
  CERTS.forEach(c => { per[c].rank = 1 + scores.filter(s => s > per[c].score).length; });
  const eligible = CERTS.map(c => per[c].eligible);
  const pick = pickRecommendation(eligible, totals, CERTS);
  const nNo = CERTS.filter(c => per[c].fits === 'No').length;
  let message;
  if (pick.max < 0) message = 'Ninguna cabe en el presupuesto: se muestra la más económica.';
  else if (nNo > 0) message = `Recomendación dentro del presupuesto; ${nNo} opción(es) excluida(s) por costo.`;
  else if (pick.advantage < P.tieThreshold) message = `Empate técnico (< ${P.tieThreshold} puntos): decide con el caso de estudio.`;
  else message = `Recomendación clara para el objetivo «${input.objective}».`;

  // ---- Sección 5: requisitos prioritarios ----
  const ind = indicatorWeights(model.indicatorMatrices);
  const catW = Object.fromEntries(CATS.map((c, i) => [c, w[i]]));
  const requirements = data.requirements.map(r => {
    const info = ind[r.indicator];
    const gw = info ? info.inCategory * catW[info.category] : null;
    const prefix = String(r.cert).slice(0, 4);
    const cert = prefix === 'LEED' ? 'LEED' : prefix === 'BREE' ? 'BREEAM' : prefix === 'EDGE' ? 'EDGE' : null;
    const mand = String(r.mandatory || '').slice(0, 2).toLowerCase() === 'sí';
    return { ...r, certKey: cert, globalWeight: gw, priority: gw == null ? '' : priorityOf(gw),
      sortKey: gw == null ? null : gw + (mand ? 0.00001 : 0) + r.row / 1e8 };
  });
  const topRequirements = {};
  for (const c of CERTS) {
    topRequirements[c] = requirements.filter(r => r.certKey === c && r.sortKey != null)
      .sort((a, b) => b.sortKey - a.sortKey);
  }
  const indicators = data.ahp.indicators.map(i => {
    const inCat = ind[i.code] ? ind[i.code].inCategory : null;
    const gw = inCat == null ? null : inCat * catW[i.category];
    return { ...i, inCategory: inCat, globalWeight: gw, priority: gw == null ? '' : priorityOf(gw) };
  });

  return {
    input, ctx, region,
    warning: ctx.outside ? '⚠ Las coordenadas caen fuera de México o en el mar: revisa latitud y longitud.' : '',
    stressIndex, refLevel, f, regions, baseAHP, siteAHP, wBase, w,
    per, totals,
    recommended: data.certNames[pick.recCert], recCert: pick.recCert,
    alternative: pick.alt ? data.certNames[pick.alt] : '—', altCert: pick.alt,
    advantage: pick.advantage, message,
    incentivesText: data.texts.incentiveNotes[input.typology],
    requirements, topRequirements, indicators, indicatorAHP: ind,
  };
}

/** Pesos medios por región de la malla (HERRAMIENTA D99:D101) y resumen por estado (RESUMEN_ESTADOS). */
export function gridStress(model, data, grid) {
  const P = model.params;
  const out = [];
  for (const [, c] of Object.entries(grid.cells)) {
    const aq = c[3] != null ? data.aquifers[String(c[3])] : null;
    const level = aq ? aq.level : null;
    const idx = level != null && level in P.stressIndex ? Number(P.stressIndex[level]) : null;
    out.push({ state: grid.states[c[0]], koppen: grid.koppen[c[1]], level, idx });
  }
  return out;
}

export function regionMeans(cells) {
  const acc = { 'Templado (C)': [0, 0], 'Árido (B)': [0, 0], 'Tropical (A)': [0, 0] };
  for (const c of cells) {
    if (c.idx == null) continue;
    const g = c.koppen && c.koppen[0];
    const r = g === 'A' ? 'Tropical (A)' : g === 'B' ? 'Árido (B)' : 'Templado (C)';
    acc[r][0] += c.idx; acc[r][1]++;
  }
  return Object.fromEntries(Object.entries(acc).map(([k, [s, n]]) => [k, n ? s / n : null]));
}

export function stateSummary(result, model, data, cells) {
  const P = model.params;
  const cw = P.criteriaWeights[result.input.objective];
  const systems = data.ahp.systems.slice(0, 3).map(s => s.weights);
  const rows = [];
  for (const st of data.states) {
    const sc = cells.filter(c => c.state === st);
    const n = sc.length;
    if (!n) continue;
    const pA = sc.filter(c => c.koppen.startsWith('A')).length / n;
    const pB = sc.filter(c => c.koppen.startsWith('B')).length / n;
    const pC = 1 - pA - pB;
    const shares = [pA, pB, pC];
    const dominant = ['Tropical (A)', 'Árido (B)', 'Templado (C)'][shares.indexOf(Math.max(...shares))];
    const over = sc.filter(c => c.level === 'Sobreexplotado (déficit)').length / n;
    const withIdx = sc.filter(c => c.idx != null);
    const meanIdx = withIdx.reduce((s, c) => s + c.idx, 0) / withIdx.length;
    const f = Number(P.sensitivity) ** (meanIdx - Number(P.referenceLevel[dominant]));
    const base = result.regions[dominant].w;
    const U = base[WATER];
    const V = f * U + 1 - U;
    const w = base.map((v, i) => (i === WATER ? f * U : v) / V);
    const scores = {};
    CERTS.forEach((c, k) => {
      const sw = systems[k];
      const coin = sw.reduce((s, v, i) => s + Math.min(v, w[i]), 0);
      const cov = sw.reduce((s, v, i) => s + (v > 0 ? w[i] : 0), 0);
      const num = CATS.reduce((s, cat, i) => s + Number(P.normAlignment[cat][c]) * w[i], 0);
      const ali = cov > 0 ? num / (3 * cov) : 0;
      const r = result.per[c];
      scores[c] = 100 * (cw.coincidencia * coin + cw.cobertura * cov + cw.alineacion * ali +
        cw.viabilidad * r.viabilidad + cw.incentivos * r.incentivos + cw.inversion * r.inversion + cw.exigencia * r.exigencia);
    });
    const eligible = CERTS.map(c => (result.per[c].fits === 'No' ? -1 : scores[c]));
    const pick = pickRecommendation(eligible, result.totals, CERTS);
    rows.push({ state: st, cells: n, pA, pB, pC, dominant, over, meanIdx, f, w, scores,
      recommended: pick.recCert, advantage: pick.advantage });
  }
  return rows;
}
