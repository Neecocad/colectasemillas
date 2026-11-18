// Sincronización con la planilla de Google Sheets a través del Web App de
// Apps Script (apps-script/Codigo.gs de este repo).
//
// Se envía UNA colecta por llamada, con su foto, una detrás de otra. Mandar todo
// junto (como un solo paquete) falla con muchas fotos: el paquete crece a
// decenas de MB y Apps Script corta por tiempo. Así cada llamada es pequeña y,
// si una falla, las demás siguen; la que falló queda pendiente para el próximo
// intento. El script es idempotente, así que reintentar nunca duplica filas.
import * as DB from './db.js';

// URL .../exec de la implementación del Apps Script publicada sobre la planilla
// BD_Colectasemillas (ver apps-script/COMO-INSTALAR.md). Al actualizar el
// script se edita esa misma implementación, así que esta URL no cambia.
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbypHJkwkRxGlQADpqbiwaMAnwzL-pss-ABUMfU1_paRabY09Qom9QKX7WEhJTxPb3A/exec';

// Una URL escrita a mano en el celular tiene prioridad sobre DEFAULT_URL. La
// clave lleva versión: si algún día cambia la implementación, se sube el
// sufijo y todos los celulares vuelven a usar DEFAULT_URL sin tocar nada.
const URL_KEY = 'colecta-semillas:sync-url-v1';

// Tiempo máximo de espera por colecta. Con mala señal es preferible cortar y
// seguir con la siguiente que dejar la pantalla esperando indefinidamente.
const TIEMPO_MAX_MS = 120000;

// Planilla BD_Colectasemillas (para descargarla desde el celular).
export const PLANILLA_ID = '1CuRf2aO6EklG0IUOTHKdSmF0IP4IS1-1iw2PqtNxIeU';
export const URL_DESCARGA_PLANILLA = `https://docs.google.com/spreadsheets/d/${PLANILLA_ID}/export?format=xlsx`;
export const URL_PLANILLA = `https://docs.google.com/spreadsheets/d/${PLANILLA_ID}/edit`;

export function getUrl() {
  try { return localStorage.getItem(URL_KEY) || DEFAULT_URL; } catch { return DEFAULT_URL; }
}

export function setUrl(url) {
  try {
    if (url.trim()) localStorage.setItem(URL_KEY, url.trim());
    else localStorage.removeItem(URL_KEY);
  } catch { /* sin almacenamiento: se usa DEFAULT_URL */ }
}

export function resetUrl() {
  try { localStorage.removeItem(URL_KEY); } catch { /* nada que borrar */ }
  return DEFAULT_URL;
}

// Lo que viaja: todos los campos de la colecta menos los internos del celular.
// La foto original sin etiqueta tampoco: solo sirve para re-etiquetar en el
// celular y duplicaría el peso de cada envío.
function paquete(reg, versionApp) {
  const { id, sincronizado, estado_sincronizacion, fecha_sincronizacion, error_sincronizacion, foto_url, foto_original, ...colecta } = reg;
  return { tipo: 'colecta_semillas', version_app: versionApp, colecta };
}

async function enviarUna(url, reg, versionApp) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIEMPO_MAX_MS);
  let resp;
  try {
    // Formulario simple (x-www-form-urlencoded): el navegador lo envía sin la
    // consulta previa (CORS "preflight") que Apps Script no sabe responder.
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: 'data=' + encodeURIComponent(JSON.stringify(paquete(reg, versionApp))),
      signal: control.signal,
    });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'Tiempo de espera agotado (señal débil)' : 'Sin conexión con el servidor');
  } finally {
    clearTimeout(reloj);
  }
  let data;
  try {
    data = await resp.json();
  } catch {
    throw new Error('Respuesta no válida (¿la implementación tiene acceso "Cualquier persona"?)');
  }
  if (data.status !== 'ok') throw new Error(data.mensaje || 'Error del servidor');
  return data;
}

// Envía todas las colectas pendientes, una por una. onProgreso(n, total) se
// llama antes de cada envío. Devuelve { enviados, total, fallidos: [...] }.
export async function sincronizar(versionApp, onProgreso) {
  const url = getUrl();
  if (!url) throw new Error('Falta configurar la dirección de sincronización (Configuración, más abajo).');

  const pendientes = (await DB.getColectas())
    .filter((r) => !r.sincronizado)
    .sort((a, b) => (a.fecha_creacion || '').localeCompare(b.fecha_creacion || ''));
  const fallidos = [];
  let enviados = 0;

  for (let i = 0; i < pendientes.length; i++) {
    const reg = pendientes[i];
    if (onProgreso) onProgreso(i + 1, pendientes.length);
    if (!navigator.onLine) {
      fallidos.push({ reg, motivo: 'El equipo quedó sin conexión' });
      continue;
    }
    try {
      const r = await enviarUna(url, reg, versionApp);
      reg.sincronizado = 1;
      reg.estado_sincronizacion = 'Sincronizada';
      reg.fecha_sincronizacion = new Date().toISOString();
      reg.foto_url = r.foto_url || '';
      reg.error_sincronizacion = '';
      enviados++;
    } catch (err) {
      reg.error_sincronizacion = err.message;
      fallidos.push({ reg, motivo: err.message });
    }
    await DB.updateColecta(reg);
  }
  return { enviados, total: pendientes.length, fallidos };
}
