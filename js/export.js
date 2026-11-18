// Exportación: planilla Excel con las columnas de la ficha de colecta y fotos en .zip.
import { buildXlsx, zipStore } from './xlsx-mini.js';
import { COLUMNAS } from './catalog.js';

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function ordenar(regs) {
  return [...regs].sort((a, b) =>
    (a.fecha || '').localeCompare(b.fecha || '') || (a.fecha_creacion || '').localeCompare(b.fecha_creacion || ''));
}

function dataUrlABytes(dataUrl) {
  const bin = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function filasPlanilla(regs) {
  const filas = [COLUMNAS.map(([titulo]) => titulo)];
  for (const r of ordenar(regs)) filas.push(COLUMNAS.map(([, campo]) => r[campo] ?? ''));
  return filas;
}

export function descargarExcel(regs) {
  descargar(buildXlsx([{ name: 'Colectas', rows: filasPlanilla(regs) }]), `colectas_semillas_${hoy()}.xlsx`);
}

export function descargarFotosZip(regs) {
  const archivos = ordenar(regs).filter((r) => r.foto).map((r) => [r.foto_nombre, dataUrlABytes(r.foto)]);
  descargar(zipStore(archivos, 'application/zip'), `fotos_colectas_${hoy()}.zip`);
}

export function descargarFoto(reg) {
  descargar(new Blob([dataUrlABytes(reg.foto)], { type: 'image/jpeg' }), reg.foto_nombre);
}
