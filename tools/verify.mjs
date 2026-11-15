// Compara el motor JS con los resultados guardados en el Excel.
// Uso: node tools/verify.mjs   (después de exportar con export_excel.py)
import { readFileSync } from 'node:fs';
import { compute, defaultModel, gridStress, regionMeans, stateSummary, CERTS } from '../js/engine.js';

const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const data = load('../data/base.json');
const grid = load('../data/grid.json');
const chk = load('../data/excel_check.json');
const model = defaultModel(data);

let fails = 0, passes = 0;
function eq(label, got, exp, tol = 1e-9) {
  let ok;
  if (typeof exp === 'number') ok = typeof got === 'number' && Math.abs(got - exp) <= tol * Math.max(1, Math.abs(exp));
  else ok = String(got ?? '').trim() === String(exp ?? '').trim();
  if (ok) passes++; else { fails++; console.log(`✗ ${label}: web=${got} · excel=${exp}`); }
}

const i = chk.inputs;
const input = { lat: i.lat, lon: i.lon, typology: i.typology, area: i.area, units: i.units, usgbc: i.usgbc,
  budget: i.budget ?? '', objective: i.objective, forceRegion: i.forceRegion || null };
const r = compute(input, model, data, grid);
const H = chk.herramienta;
const col = { LEED: 'C', BREEAM: 'D', EDGE: 'E' };

eq('C15 estado', r.ctx.state, H.C15);
eq('C16 ciudad', r.ctx.cityLabel, H.C16);
eq('C17 clima', `${r.ctx.koppen} · ${r.ctx.koppenName}`, H.C17);
eq('C18 región', r.region, H.C18);
eq('C19 acuífero', r.ctx.aquiferLabel, H.C19);
eq('C20 condición', r.ctx.condition, H.C20);
eq('C21 nivel', r.ctx.level, H.C21);
eq('C22 RHA', `${r.ctx.rhaLabel} · presión ${r.ctx.rhaClass}`, H.C22);
eq('C23 implicación', r.ctx.implication, H.C23);
eq('C27 índice', r.stressIndex, H.C27);
eq('C28 referencia', r.refLevel, H.C28);
eq('C29 f', r.f, H.C29);
eq('C38 λmax', r.siteAHP.lambda, H.C38);
eq('E38 CR', r.siteAHP.cr, H.E38);
['D41', 'D42', 'D43', 'D44', 'D45'].forEach((c, k) => eq(`${c} peso sitio`, r.w[k], H[c]));
['C41', 'C42', 'C43', 'C44', 'C45'].forEach((c, k) => eq(`${c} peso base`, r.wBase[k], H[c]));
for (const c of CERTS) {
  const x = col[c], p = r.per[c];
  eq(`${x}49 coincidencia ${c}`, p.coincidencia, H[`${x}49`]);
  eq(`${x}50 cobertura ${c}`, p.cobertura, H[`${x}50`]);
  eq(`${x}51 alineación ${c}`, p.alineacion, H[`${x}51`]);
  eq(`${x}52 tarifas ${c}`, p.fees.total, H[`${x}52`]);
  eq(`${x}54 costo total ${c}`, p.total, H[`${x}54`]);
  eq(`${x}55 viabilidad ${c}`, p.viabilidad, H[`${x}55`]);
  eq(`${x}56 incentivos ${c}`, p.incentivos, H[`${x}56`]);
  eq(`${x}57 inversión ${c}`, p.inversion, H[`${x}57`]);
  eq(`${x}59 puntuación ${c}`, p.score, H[`${x}59`]);
}
eq('C64 recomendada', r.recommended, H.C64);
eq('C65 alternativa', r.alternative, H.C65);
eq('E64 ventaja', r.advantage, H.E64);
eq('F64 mensaje', r.message, H.F64);
eq('C66 incentivos', r.incentivesText, H.C66);
const top = [...r.topRequirements.LEED.slice(0, 5), ...r.topRequirements.BREEAM.slice(0, 5), ...r.topRequirements.EDGE.slice(0, 5)];
const pref = { LEED: 'LEED', BREEAM: 'BREEAM', EDGE: 'EDGE' };
top.forEach((q, k) => {
  eq(`B${70 + k} requisito`, `${pref[q.certKey]} · ${q.code} · ${q.name}`, H[`B${70 + k}`]);
  eq(`C${70 + k} peso global`, q.globalWeight, H[`C${70 + k}`]);
});
for (const reg of Object.keys(chk.pesosAHP)) chk.pesosAHP[reg].forEach((v, k) => eq(`PESOS AHP ${reg}[${k}]`, r.regions[reg].w[k], v));

const cells = gridStress(model, data, grid);
const means = regionMeans(cells);
for (const [reg, v] of Object.entries(chk.regionMeans)) eq(`D99:D101 media ${reg}`, means[reg], v);

const states = stateSummary(r, model, data, cells);
for (const s of states) {
  const e = chk.states[s.state];
  eq(`${s.state} celdas`, s.cells, e.C);
  eq(`${s.state} dominante`, s.dominant, e.G);
  eq(`${s.state} % déficit`, s.over, e.H);
  eq(`${s.state} índice medio`, s.meanIdx, e.I);
  eq(`${s.state} LEED`, s.scores.LEED, e.P);
  eq(`${s.state} BREEAM`, s.scores.BREEAM, e.Q);
  eq(`${s.state} EDGE`, s.scores.EDGE, e.R);
  eq(`${s.state} recomendada`, s.recommended, e.S);
}

console.log(`\n${passes} comprobaciones correctas · ${fails} diferencias`);
console.log(`Caso del Excel: ${r.ctx.cityLabel} → ${r.recommended} (LEED ${r.per.LEED.score.toFixed(2)} · BREEAM ${r.per.BREEAM.score.toFixed(2)} · EDGE ${r.per.EDGE.score.toFixed(2)})`);
process.exit(fails ? 1 : 0);
