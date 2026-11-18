"""Genera js/recolectores-datos.js con los nombres de la nómina de Biocys.

Uso (desde la raíz del repositorio):
    python3 tools/generar_recolectores.py "ruta/al/Reporte_de_Nomina.xlsx"

La nómina NO se guarda en el repositorio: trae RUT, fechas de nacimiento,
direcciones y correos. Este script lee SOLO la columna
"Colaborador - Nombre Completo" y escribe los nombres, nada más.

Los nombres quedan tal como vienen en la nómina (apellidos primero). No se
reordenan a "nombre apellido" porque no hay forma segura de saber dónde termina
el apellido (p. ej. apellidos compuestos); la búsqueda del formulario encuentra
cualquier parte del nombre igual.
"""
import json
import os
import sys

import openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, 'js', 'recolectores-datos.js')
COLUMNA = 'Colaborador - Nombre Completo'


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    ws = openpyxl.load_workbook(sys.argv[1], read_only=True).worksheets[0]
    nombres, col = [], None
    for fila in ws.iter_rows(values_only=True):
        if col is None:
            if COLUMNA in fila:
                col = fila.index(COLUMNA)
            continue
        if fila[col]:
            nombres.append(' '.join(str(fila[col]).split()))
    if col is None:
        sys.exit(f'No se encontró la columna "{COLUMNA}" en la planilla')
    nombres = sorted(set(nombres), key=lambda n: n.lower())
    with open(SALIDA, 'w', encoding='utf-8') as f:
        f.write('// ARCHIVO GENERADO por tools/generar_recolectores.py — no editar a mano.\n')
        f.write('// Fuente: nómina de personal activo de Biocys (solo la columna de nombres).\n\n')
        f.write('export const NOMINA = [\n')
        f.write(''.join('  ' + json.dumps(n, ensure_ascii=False) + ',\n' for n in nombres))
        f.write('];\n')
    print(f'{len(nombres)} nombres -> {os.path.relpath(SALIDA, RAIZ)}')


if __name__ == '__main__':
    main()
