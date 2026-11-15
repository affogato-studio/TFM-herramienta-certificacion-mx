# Herramienta de selección de certificación sostenible · México

Versión web de la herramienta del TFM (`HERRAMIENTA_9NOV_v3_1.xlsx`). Recomienda **LEED v4 BD+C**, **BREEAM Int. NC v7** o **EDGE v3** según:

- la **ubicación** (clima Köppen-Geiger y estrés hídrico del acuífero, en una malla de 0.05° de todo México),
- los **pesos AHP** de la región, con el AGUA ajustada por el estrés del acuífero,
- la **tipología**, la **superficie**, el **número de departamentos** y la membresía USGBC (tarifas),
- el **objetivo** y el **presupuesto** del promotor.

La web reproduce todas las fórmulas del Excel. `tools/verify.mjs` compara 360 resultados con los valores guardados en el Excel (contexto del sitio, pesos, puntuaciones, recomendación, requisitos prioritarios y los 32 estados).

## Estructura

| Archivo | Qué es |
|---|---|
| `index.html`, `css/`, `js/app.js` | Interfaz paso a paso: Ubicación → Proyecto → Promotor → Resultado |
| `js/engine.js` | Motor de cálculo: cada función indica la hoja y las celdas del Excel que replica |
| `data/base.json` | Parámetros, juicios AHP, requisitos, normativa, acuíferos, ciudades… |
| `data/grid.json` | Malla de 72 214 celdas (estado, Köppen, acuífero) |
| `data/excel_check.json` | Resultados del Excel, solo para la verificación |
| `tools/export_excel.py` | Genera los JSON a partir del Excel |
| `tools/verify.mjs` | Compara el motor JS con el Excel |

## Actualizar los datos cuando cambie el Excel

1. Abre el Excel, haz tus cambios y **guárdalo** (así se guardan los valores recalculados). Ciérralo.
2. Exporta (solo usa Python, sin instalar nada):
   ```
   python tools/export_excel.py "ruta/a/HERRAMIENTA_9NOV_v3_1.xlsx"
   ```
3. Verifica que la web coincide con el Excel:
   ```
   node tools/verify.mjs
   ```
4. Sube los cambios a GitHub (`git add -A`, `git commit -m "..."`, `git push`).

> Las constantes de las tarifas (hoja COSTOS) están escritas en las fórmulas del Excel, no en celdas. Si cambian, edítalas en `tools/export_excel.py` (sección `fees`).
>
> El motor (`js/engine.js`) también calcula el resumen por estados; la web no lo muestra, pero `verify.mjs` lo sigue comprobando.

## Ver la web en tu computadora

Los navegadores no dejan cargar los JSON abriendo `index.html` con doble clic. Usa un servidor local:

```
python -m http.server 8000
```

y abre <http://localhost:8000>.

## Publicar con GitHub Pages

En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**. En uno o dos minutos la web queda en
`https://affogato-studio.github.io/TFM-herramienta-certificacion-mx/`.

## Notas de método

- La opción «Forzar región AHP» del Excel no aparece en la web (nota «QUITAR» en la celda D12). El motor la sigue admitiendo (`forceRegion`).
- Los costos indirectos, el reconocimiento internacional y la exigencia técnica son **supuestos de la autora** que conviene validar con cotizaciones y expertos.
- La web usa siempre los parámetros del Excel; para cambiarlos, edita el Excel y vuelve a exportar.
