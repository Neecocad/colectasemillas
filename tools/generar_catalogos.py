"""Genera js/catalogos-datos.js a partir de las planillas de la carpeta datos/.

Uso (desde la raíz del repositorio):
    python3 tools/generar_catalogos.py

Lee:
  - datos/Modificaciones_ficha_colecta-listas_desplegables.xlsx
      columna D (Nombre común) + E (Nombre científico) -> pares de especies
      columna J -> cuencas
  - datos/Regiones_provincias_comunas.xlsx
      columnas A/B/C desde la fila 7 -> región, provincia, comuna

El resto de los catálogos (faena, hábito, estado, momento, etc.) son listas
cortas y viven escritas a mano en js/catalog.js.

Si cambia alguna planilla, se reemplaza el archivo en datos/, se vuelve a correr
este script y se suben CACHE en sw.js y VERSION en js/app.js.
"""
import json
import os
import sys

import openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FICHA = os.path.join(RAIZ, 'datos', 'Modificaciones_ficha_colecta-listas_desplegables.xlsx')
TERRITORIO = os.path.join(RAIZ, 'datos', 'Regiones_provincias_comunas.xlsx')
SALIDA = os.path.join(RAIZ, 'js', 'catalogos-datos.js')


def limpio(v):
    # Normaliza espacios repetidos y bordes ("Rio Elqui  (043)" -> "Rio Elqui (043)").
    return ' '.join(str(v).split()) if v is not None else ''


def especies(ws):
    pares, vistos = [], set()
    for fila in range(2, ws.max_row + 1):
        comun = limpio(ws.cell(fila, 4).value)
        cientifico = limpio(ws.cell(fila, 5).value)
        if not comun and not cientifico:
            continue
        if not comun or not cientifico:
            sys.exit(f'Fila {fila}: especie incompleta (común={comun!r}, científico={cientifico!r})')
        if cientifico in vistos:
            sys.exit(f'Fila {fila}: nombre científico repetido: {cientifico}')
        vistos.add(cientifico)
        pares.append([cientifico, comun])
    return sorted(pares, key=lambda p: p[0].lower())


def cuencas(ws):
    return [limpio(ws.cell(f, 10).value) for f in range(2, ws.max_row + 1) if ws.cell(f, 10).value]


def territorio(ws):
    arbol = {}
    for fila in range(7, ws.max_row + 1):
        region, provincia, comuna = (limpio(ws.cell(fila, c).value) for c in (1, 2, 3))
        if not region:
            continue
        arbol.setdefault(region, {}).setdefault(provincia, []).append(comuna)
    for provincias in arbol.values():
        for p in provincias:
            provincias[p].sort()
    return arbol


def lineas(items):
    return ''.join('  ' + json.dumps(i, ensure_ascii=False) + ',\n' for i in items)


def main():
    ficha = openpyxl.load_workbook(FICHA).worksheets[0]
    terr = openpyxl.load_workbook(TERRITORIO).worksheets[0]
    datos = {
        'ESPECIES': especies(ficha),
        'CUENCAS': cuencas(ficha),
        'TERRITORIO': territorio(terr),
    }
    with open(SALIDA, 'w', encoding='utf-8') as f:
        f.write('// ARCHIVO GENERADO por tools/generar_catalogos.py — no editar a mano.\n')
        f.write('// Fuente: planillas de la carpeta datos/.\n\n')
        f.write('// [nombre científico, nombre común], ordenado por nombre científico.\n')
        f.write('export const ESPECIES = [\n' + lineas(datos['ESPECIES']) + '];\n\n')
        f.write('export const CUENCAS = [\n' + lineas(datos['CUENCAS']) + '];\n\n')
        f.write('// { región: { provincia: [comunas] } }: regiones y provincias en el orden de la planilla, comunas en orden alfabético.\n')
        f.write('export const TERRITORIO = ' + json.dumps(datos['TERRITORIO'], ensure_ascii=False, indent=1) + ';\n')
    print(f"{len(datos['ESPECIES'])} especies, {len(datos['CUENCAS'])} cuencas, "
          f"{len(datos['TERRITORIO'])} regiones -> {os.path.relpath(SALIDA, RAIZ)}")


if __name__ == '__main__':
    main()
