"""
Exporta los datos de HERRAMIENTA_*.xlsx a los archivos JSON que usa la web.

Uso (desde la carpeta del repositorio):
    python tools/export_excel.py "ruta/a/HERRAMIENTA_9NOV_v3_1.xlsx"

Solo usa la biblioteca estándar de Python (no hace falta instalar nada).
Lee los VALORES GUARDADOS en el Excel: abre y guarda el archivo en Excel
antes de exportar para que las fórmulas estén recalculadas.

Genera:
    data/base.json         parámetros, AHP, requisitos, normativa, tablas
    data/grid.json         malla de 0.05° (Köppen + acuífero) de todo México
    data/excel_check.json  resultados del Excel para verificar el motor JS
"""
import json, os, re, sys, zipfile
import xml.etree.ElementTree as ET

M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def col_to_num(col):
    n = 0
    for ch in col:
        n = n * 26 + ord(ch) - 64
    return n


def num_to_col(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


class Workbook:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        self.ss = []
        with self.z.open('xl/sharedStrings.xml') as f:
            for _, el in ET.iterparse(f):
                if el.tag == M + 'si':
                    self.ss.append(''.join(t.text or '' for t in el.iter(M + 't')))
                    el.clear()
        wb = ET.fromstring(self.z.read('xl/workbook.xml'))
        rels = ET.fromstring(self.z.read('xl/_rels/workbook.xml.rels'))
        rmap = {r.get('Id'): r.get('Target') for r in rels}
        self.paths = {s.get('name'): 'xl/' + rmap[s.get(R + 'id')].lstrip('/').replace('xl/', '')
                      for s in wb.iter(M + 'sheet')}
        self.cache = {}

    def sheet(self, name):
        """Devuelve {'B4': valor, ...} con los valores guardados."""
        if name in self.cache:
            return self.cache[name]
        cells = {}
        with self.z.open(self.paths[name]) as f:
            for _, el in ET.iterparse(f):
                if el.tag == M + 'c':
                    t = el.get('t')
                    v = el.find(M + 'v')
                    val = None
                    if t == 'inlineStr':
                        val = ''.join(x.text or '' for x in el.iter(M + 't'))
                    elif v is not None and v.text is not None:
                        if t == 's':
                            val = self.ss[int(v.text)]
                        elif t in ('str', 'e'):
                            val = v.text
                        elif t == 'b':
                            val = v.text == '1'
                        else:
                            f_ = float(v.text)
                            val = int(f_) if f_.is_integer() and abs(f_) < 1e15 else f_
                    if val is not None and val != '':
                        cells[el.get('r')] = val
                    el.clear()
                elif el.tag == M + 'row':
                    el.clear()
        self.cache[name] = cells
        return cells


def clean(v):
    if isinstance(v, str):
        return v.strip()
    return v


def get(sh, ref):
    return clean(sh.get(ref))


def rows_of(sh, first, last, cols):
    out = []
    for r in range(first, last + 1):
        out.append([get(sh, f'{c}{r}') for c in cols])
    return out


def col_range(a, b):
    return [num_to_col(i) for i in range(col_to_num(a), col_to_num(b) + 1)]


CATS = ['TRANSPORTE', 'ECOLOGÍA', 'AGUA', 'ENERGÍA', 'MATERIALES']
CERTS = ['LEED', 'BREEAM', 'EDGE']
REGIONS = ['Templado (C)', 'Árido (B)', 'Tropical (A)']


def export(xlsx, outdir):
    wb = Workbook(xlsx)
    H = wb.sheet('HERRAMIENTA')
    P = wb.sheet('PESOS AHP')
    K = wb.sheet('CLIMA_KOPPEN')
    E = wb.sheet('ESTRES_HIDRICO')
    C = wb.sheet('COSTOS')
    Q = wb.sheet('REQUISITOS')
    N = wb.sheet('NOM MEX')
    CE = wb.sheet('CERTIFICACIONES')
    CO = wb.sheet('CONCLUSIONES')
    RS = wb.sheet('RESUMEN_ESTADOS')
    CI = wb.sheet('CIUDADES')
    GK = wb.sheet('GRID_KOPPEN')
    GH = wb.sheet('GRID_HIDRICO')

    # ---------- Parámetros de la regla de decisión (HERRAMIENTA, sección 6) ----------
    def by_cert(row):
        return {c: get(H, f'{col}{row}') for c, col in zip(CERTS, 'CDE')}

    objectives = [get(H, f'B{r}') for r in range(136, 143)]
    typologies = [get(H, f'B{r}') for r in range(130, 134)]
    crit_keys = ['coincidencia', 'cobertura', 'alineacion', 'viabilidad', 'incentivos', 'inversion', 'exigencia']

    params = {
        'stressIndex': {get(H, f'B{r}'): get(H, f'C{r}') for r in range(92, 97)},
        'referenceLevel': {get(H, f'B{r}'): get(H, f'C{r}') for r in range(99, 102)},
        'sensitivity': get(H, 'C103'),
        'normAlignment': {cat: by_cert(r) for cat, r in zip(CATS, range(106, 111))},
        'ease': by_cert(112),
        'marketMX': by_cert(113),
        'rigor': by_cert(114),
        'indirectFixed': by_cert(117),
        'indirectPerM2': by_cert(118),
        'investment': {get(H, f'B{r}'): by_cert(r) for r in range(121, 128)},
        'incentives': {get(H, f'B{r}'): by_cert(r) for r in range(130, 134)},
        'criteriaWeights': {get(H, f'B{r}'): {k: get(H, f'{col}{r}') for k, col in zip(crit_keys, 'CDEFGHI')}
                            for r in range(136, 143)},
        'tieThreshold': 3,
        # Tarifas oficiales (hoja COSTOS). Las constantes de las fórmulas se copian aquí:
        'fees': {
            'LEED': {'regMember': 1350, 'regNonMember': 1700,
                     'reviewMinMember': 3200, 'reviewRateMember': 0.064,
                     'reviewMinNonMember': 3825, 'reviewRateNonMember': 0.076,
                     'ft2PerM2': 10.7639},
            'BREEAM': {'registration': get(C, 'B15'), 'certMin': 2750, 'perUnitUpTo100': 50, 'perUnitOver100': 22},
            'EDGE': {'registration': get(C, 'B20'), 'certMin': 2900, 'perM2': 0.29},
        },
    }
    texts = {
        'indirectNote': get(H, 'F116'),
        'indirectFixedNote': get(H, 'F117'),
        'indirectPerM2Note': get(H, 'F118'),
        'investmentNotes': {get(H, f'B{r}'): get(H, f'F{r}') for r in range(121, 128)},
        'incentiveNotes': {get(H, f'B{r}'): get(H, f'F{r}') for r in range(130, 134)},
        'criteria': {k: {'label': get(H, f'B{r}'), 'what': get(H, f'G{r}')}
                     for k, r in zip(crit_keys, [49, 50, 51, 55, 56, 57, 58])},
        'costsTitle': get(C, 'A1'),
        'feeComments': {
            'LEED': 'USGBC: registro $1,350 miembro / $1,700 no miembro; revisión $0.064/ft² miembro (mín. $3,200) o $0.076/ft² no miembro (mín. $3,825). 1 m² = 10.7639 ft².',
            'BREEAM': 'Registro $1,750; certificación $50/vivienda hasta 100 (mín. $2,750); $22/vivienda de 101 a 1,000.',
            'EDGE': 'Registro $349; certificación $0.29/m² (mín. $2,900) para 0–25,000 m².',
        },
    }

    # ---------- AHP ----------
    pair_rows = range(25, 35)
    pairs = []
    for r in pair_rows:
        a, b = [s.strip() for s in get(P, f'B{r}').split(' vs ')]
        pairs.append({
            'a': a, 'b': b,
            'values': {REGIONS[0]: get(P, f'D{r}'), REGIONS[1]: get(P, f'H{r}'), REGIONS[2]: get(P, f'K{r}')},
            'why': {REGIONS[0]: get(P, f'E{r}'), REGIONS[1]: get(P, f'I{r}'), REGIONS[2]: get(P, f'L{r}')},
        })
    systems = []
    for r in range(66, 71):
        systems.append({'name': get(P, f'B{r}'),
                        'weights': [get(P, f'{c}{r}') for c in 'DEFGH'],
                        'source': get(P, f'K{r}')})
    # matrices de indicadores (triángulo superior editable)
    ind_blocks = {'TRANSPORTE': (111, 4), 'ECOLOGÍA': (119, 5), 'AGUA': (128, 4), 'ENERGÍA': (136, 5), 'MATERIALES': (145, 5)}
    indicator_matrices = {}
    for cat, (r0, n) in ind_blocks.items():
        cols = [num_to_col(3 + i) for i in range(n)]
        codes = [get(P, f'B{r0 + i}') for i in range(n)]
        mat = [[get(P, f'{cols[j]}{r0 + i}') for j in range(n)] for i in range(n)]
        indicator_matrices[cat] = {'codes': codes, 'matrix': mat}
    indicators = []
    cat = None
    for r in range(79, 107):
        code = get(P, f'B{r}')
        if code in CATS:
            cat = code
            continue
        indicators.append({'code': code, 'category': cat, 'name': get(P, f'C{r}'),
                           'groups': get(P, f'F{r}'), 'why': get(P, f'K{r}')})
    criteria_ahp = []
    for r in range(4, 10):
        criteria_ahp.append({'title': get(P, f'B{r}'), 'literature': get(P, f'C{r}'), 'source': get(P, f'F{r}'),
                             'mexico': get(P, f'H{r}'), 'data': get(P, f'L{r}')})
    conclusions_ahp = [{'title': get(P, f'B{r}'), 'text': get(P, f'E{r}')} for r in range(153, 160)]
    ahp = {
        'categories': CATS, 'regions': REGIONS, 'pairs': pairs, 'systems': systems,
        'indicators': indicators, 'indicatorMatrices': indicator_matrices,
        'method': get(P, 'B1'), 'saatyScale': get(P, 'B23'), 'regionRule': get(P, 'B13'),
        'criteria': criteria_ahp, 'conclusions': conclusions_ahp,
        'readings': [get(P, f'L{r}') for r in range(15, 20)],
        'indicatorRule': get(P, 'B77'), 'matchNote': get(P, 'B74'),
    }

    # ---------- Clima, agua y ciudades ----------
    koppen_legend = []
    for r in range(17, 40):
        code = get(K, f'B{r}')
        if not code or not re.match(r'^[A-E][A-Za-z]{1,2}$', str(code)):
            continue
        koppen_legend.append({'code': code, 'group': get(K, f'C{r}'), 'name': get(K, f'D{r}'),
                              'criterion': get(K, f'E{r}'), 'implication': get(K, f'F{r}'), 'pct': get(K, f'G{r}')})
    stress_scale = [{'level': get(E, f'A{r}'), 'range': get(E, f'B{r}'), 'criterion': get(E, f'C{r}'),
                     'source': get(E, f'D{r}'), 'implication': get(E, f'E{r}')} for r in range(23, 28)]
    rha = []
    for r in range(33, 46):
        if get(E, f'A{r}') is None:
            continue
        rha.append({'code': get(E, f'A{r}'), 'name': get(E, f'B{r}'), 'pressure': get(E, f'C{r}'),
                    'class': get(E, f'D{r}'), 'reading': get(E, f'E{r}'), 'aquifers': get(E, f'F{r}'),
                    'deficit': get(E, f'G{r}'), 'net': get(E, f'I{r}')})
    aquifers = {}
    for r in range(88, 741):
        code = get(E, f'A{r}')
        if code is None:
            continue
        aquifers[str(int(code))] = {
            'name': get(E, f'B{r}'), 'state': get(E, f'C{r}'), 'rha': get(E, f'D{r}'),
            'recharge': get(E, f'E{r}'), 'dnc': get(E, f'F{r}'), 'veas': get(E, f'G{r}'),
            'dma': get(E, f'H{r}'), 'condition': get(E, f'I{r}'), 'index': get(E, f'J{r}'),
            'level': get(E, f'K{r}'), 'area': get(E, f'L{r}')}
    cities = []
    for r in range(2, 191):
        if get(CI, f'A{r}') is None:
            continue
        cities.append({'name': get(CI, f'A{r}'), 'state': get(CI, f'B{r}'), 'lat': get(CI, f'C{r}'),
                       'lon': get(CI, f'D{r}'), 'pop': get(CI, f'E{r}'), 'capital': get(CI, f'F{r}'),
                       'koppen': get(CI, f'G{r}'), 'rubel': get(CI, f'H{r}')})

    # ---------- Requisitos ----------
    req_cols = 'BCDEFGHIJKLMNOPQ'
    req_keys = ['cert', 'category', 'code', 'name', 'type', 'points', 'objective', 'asks', 'mandatory',
                'studies', 'deliverables', 'dependsOn', 'difficulty', 'source', 'nom', 'indicator']
    requirements = []
    for r in range(4, 150):
        if get(Q, f'C{r}') is None:
            continue
        item = {k: get(Q, f'{c}{r}') for k, c in zip(req_keys, req_cols)}
        item['row'] = r
        requirements.append(item)
    req_headers = {k: get(Q, f'{c}2') for k, c in zip(req_keys, req_cols)}

    # ---------- Tablas de consulta ----------
    def table(sh, header_row, first, last, c0, c1):
        cols = col_range(c0, c1)
        head = [get(sh, f'{c}{header_row}') for c in cols]
        rows = []
        for r in range(first, last + 1):
            vals = [get(sh, f'{c}{r}') for c in cols]
            if any(v is not None for v in vals):
                rows.append(vals)
        return {'headers': head, 'rows': rows}

    nom = {'title1': get(N, 'B1'), 'table1': table(N, 2, 3, 34, 'B', 'K'),
           'title2': get(N, 'B36'), 'table2': table(N, 37, 38, 44, 'B', 'K')}
    cert_blocks = {}
    for name, (c0, c1) in {'LEED v4 BD+C NC': ('C', 'K'), 'BREEAM Int. NC v7': ('L', 'T'), 'EDGE v3': ('U', 'AC')}.items():
        cols = col_range(c0, c1)
        cert_blocks[name] = {'title': get(CE, f'{c0}2'), 'headers': [get(CE, f'{c}3') for c in cols],
                             'rows': {get(CE, f'B{r}'): [get(CE, f'{c}{r}') for c in cols] for r in range(4, 12)}}
    certificaciones = {
        'aspects': [get(CE, f'B{r}') for r in range(4, 12)],
        'blocks': cert_blocks,
        'normativa': {get(CE, f'B{r}'): get(CE, f'AD{r}') for r in range(4, 12)},
        'incentivos': get(CE, 'AE3'),
    }
    conclusiones = table(CO, 2, 3, 60, 'B', 'J')

    base = {
        'source': os.path.basename(xlsx),
        'objectives': objectives, 'typologies': typologies, 'certs': CERTS,
        'certNames': {'LEED': get(H, 'C48'), 'BREEAM': get(H, 'D48'), 'EDGE': get(H, 'E48')},
        'params': params, 'texts': texts, 'ahp': ahp,
        'koppenLegend': koppen_legend, 'stressScale': stress_scale, 'stressNote': get(E, 'A28'),
        'rha': rha, 'aquifers': aquifers, 'cities': cities,
        'requirements': requirements, 'requirementHeaders': req_headers,
        'nom': nom, 'certificaciones': certificaciones, 'conclusiones': conclusiones,
        'states': [get(RS, f'B{r}') for r in range(4, 36)],
        'example': {'lat': H.get('C4'), 'lon': H.get('C5'), 'typology': H.get('C6'), 'area': H.get('C7'),
                    'units': H.get('C8'), 'usgbc': H.get('C9'), 'budget': H.get('C10', ''),
                    'objective': H.get('C11')},
    }

    # ---------- Malla ----------
    states, koppens, origins = [], [], []

    def idx(lst, v):
        if v not in lst:
            lst.append(v)
        return lst.index(v)

    hid = {}
    r = 2
    while True:
        key = GH.get(f'A{r}')
        if key is None:
            break
        hid[key] = (GH.get(f'E{r}'), GH.get(f'F{r}'))
        r += 1
    cells = {}
    r = 2
    while True:
        key = GK.get(f'A{r}')
        if key is None:
            break
        aq, orig = hid.get(key, (None, None))
        cells[key] = [idx(states, GK.get(f'D{r}')), idx(koppens, GK.get(f'E{r}')), idx(koppens, GK.get(f'F{r}')),
                      int(aq) if isinstance(aq, (int, float)) else None, idx(origins, orig)]
        r += 1
    grid = {'note': 'Clave = ROUND(lat*20)|ROUND(lon*20). Valores: [estado, Köppen Beck 2023, Köppen Rubel 2017, clave acuífero, origen del dato acuífero]',
            'states': states, 'koppen': koppens, 'origins': origins, 'cells': cells}

    # ---------- Resultados guardados en el Excel (para verificar) ----------
    check = {
        'inputs': {'lat': H.get('C4'), 'lon': H.get('C5'), 'typology': H.get('C6'), 'area': H.get('C7'),
                   'units': H.get('C8'), 'usgbc': H.get('C9'), 'budget': H.get('C10'), 'objective': H.get('C11'),
                   'forceRegion': H.get('C12')},
        'herramienta': {ref: H.get(ref) for ref in
                        ['C15', 'C16', 'C17', 'C18', 'C19', 'C20', 'C21', 'C22', 'C23', 'C27', 'C28', 'C29',
                         'C38', 'E38', 'D41', 'D42', 'D43', 'D44', 'D45', 'C41', 'C42', 'C43', 'C44', 'C45',
                         'C49', 'D49', 'E49', 'C50', 'D50', 'E50', 'C51', 'D51', 'E51', 'C52', 'D52', 'E52',
                         'C54', 'D54', 'E54', 'C55', 'D55', 'E55', 'C56', 'D56', 'E56', 'C57', 'D57', 'E57',
                         'C59', 'D59', 'E59', 'C64', 'C65', 'E64', 'F64', 'C66']
                        + [f'B{r}' for r in range(70, 85)] + [f'C{r}' for r in range(70, 85)]},
        'regionMeans': {get(H, f'B{r}'): H.get(f'D{r}') for r in range(99, 102)},
        'pesosAHP': {REGIONS[0]: [P.get(f'I{r}') for r in range(38, 43)],
                     REGIONS[1]: [P.get(f'I{r}') for r in range(47, 52)],
                     REGIONS[2]: [P.get(f'I{r}') for r in range(56, 61)]},
        'states': {RS.get(f'B{r}'): {c: RS.get(f'{c}{r}') for c in 'CDEFGHIJKLMNOPQRST'} for r in range(4, 36)},
    }

    os.makedirs(outdir, exist_ok=True)
    for name, obj in [('base.json', base), ('grid.json', grid), ('excel_check.json', check)]:
        with open(os.path.join(outdir, name), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        print(f'{name}: {os.path.getsize(os.path.join(outdir, name)) / 1024:.0f} KB')
    print(f'{len(cells)} celdas de malla · {len(aquifers)} acuíferos · {len(requirements)} requisitos · {len(cities)} ciudades')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    here = os.path.dirname(os.path.abspath(__file__))
    export(sys.argv[1], os.path.join(here, '..', 'data'))
