/**
 * Colecta de semillas — Vivero Guayacanes · Web App de sincronización.
 *
 * Recibe las colectas que envía la app del celular (botón "Sincronizar") y:
 *   1. guarda la fotografía en la unidad compartida, en una carpeta por fecha
 *      de colecta y faena:  BD_Colecta de semillas / Fotografías / AAAAMMDD_Faena /
 *   2. escribe (o actualiza) una fila por colecta en la hoja "Colectas" de la
 *      planilla BD_Colectasemillas.
 *
 * La app envía UNA colecta por llamada ("por partes"): así cada llamada es
 * corta y nunca choca con el límite de tiempo de Apps Script, aunque haya
 * cientos de fotos pendientes. Si la señal se corta a la mitad, lo ya enviado
 * queda guardado y el resto sigue pendiente en el celular.
 *
 * Es idempotente (enviar dos veces lo mismo no duplica nada): la fila se busca
 * por "ID colecta" y la foto por su nombre de archivo dentro de su carpeta.
 *
 * --- Instalación --- (guía detallada: apps-script/COMO-INSTALAR.md)
 * 1. Abre la planilla BD_Colectasemillas → Extensiones → Apps Script.
 *    Borra todo y pega este archivo. Guarda (Ctrl/Cmd+S).
 * 2. Implementar → Nueva implementación → Aplicación web:
 *      - Ejecutar como: Yo
 *      - Quién tiene acceso: Cualquier persona
 * 3. Copia la URL .../exec y pégala en la app (Sincronizar → Configuración).
 * 4. Para actualizar este archivo más adelante NO crees otra implementación:
 *    Implementar → Administrar implementaciones → editar (lápiz) →
 *    Versión: Nueva versión → Implementar. Así la URL no cambia.
 */

// Planilla "BD_Colectasemillas" (lo que va entre /d/ y /edit en su URL).
const SPREADSHEET_ID = '1CuRf2aO6EklG0IUOTHKdSmF0IP4IS1-1iw2PqtNxIeU';

// Carpeta "BD_Colecta de semillas" (unidad compartida VIVERO 2026). Dentro se
// crea sola la carpeta de fotografías y, dentro de ella, una por fecha y faena.
const CARPETA_BD_ID = '1oBUJN5G3MpZLwHg74JM0deOOyUY6w7hd';
const CARPETA_FOTOS = 'Fotografías';

const HOJA = 'Colectas';
const VERSION_SCRIPT = 'v2';

// Columnas de la hoja. Las 18 primeras son las de la ficha de colecta, en el
// mismo orden que el Excel de la app (js/catalog.js → COLUMNAS). Las que siguen
// son de control: sirven para ubicar el punto con precisión y para que el
// script encuentre la fila al reenviar. `campo` es la clave que manda la app.
const COLUMNAS = [
  ['Fecha colecta', 'fecha'],
  ['Nombre de recolector', 'recolector'],
  ['Faena (en caso que corresponda)', 'faena'],
  ['Nombre científico', 'nombre_cientifico'],
  ['Nombre común', 'nombre_comun'],
  ['Hábito de crecimiento', 'habito'],
  ['Estado identificación', 'estado_identificacion'],
  ['Momento de colecta', 'momento_colecta'],
  ['Adjuntar una fotografía de individuo georeferenciada', 'foto_nombre'],
  ['Cuenca', 'cuenca'],
  ['Región', 'region'],
  ['Provincia', 'provincia'],
  ['Comuna', 'comuna'],
  ['Coordenada Este', 'utm_este'],
  ['Coordenada Norte', 'utm_norte'],
  ['Semillas colectadas de', 'semillas_de'],
  ['Cantidad colectada (gramos)', 'cantidad_gramos'],
  ['Comentarios', 'comentarios'],
  // --- Control ---
  ['Huso UTM', 'huso'],
  ['Latitud', 'latitud'],
  ['Longitud', 'longitud'],
  ['Precisión GPS (m)', 'precision_m'],
  ['Foto tomada', 'foto_tomada'],
  ['Registrada en la app', 'fecha_creacion'],
  ['Sincronizada', '_sincronizada'],
  ['Versión app', '_version_app'],
  ['ID colecta', 'record_id'],
];
const COL_FOTO = COLUMNAS.findIndex(function (c) { return c[1] === 'foto_nombre'; }) + 1;
const COL_ID = COLUMNAS.length; // "ID colecta" va al final
const COLUMNAS_TEXTO = ['fecha', 'foto_tomada', 'fecha_creacion', '_sincronizada', 'record_id'];

function doPost(e) {
  // Evita que dos celulares sincronizando a la vez escriban la misma fila.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const payload = JSON.parse(e.parameter && e.parameter.data ? e.parameter.data : e.postData.contents);
    if (payload.tipo !== 'colecta_semillas') {
      return _json({ status: 'error', mensaje: 'Este Web App solo recibe tipo: colecta_semillas. Recibido: ' + payload.tipo });
    }
    const c = payload.colecta;
    if (!c || !c.record_id) return _json({ status: 'error', mensaje: 'Falta la colecta o su record_id' });

    const carpeta = _carpetaDelDia(c.fecha, c.faena);
    const foto = _guardarFoto(carpeta, c.foto, c.foto_nombre);
    const fila = _escribirFila(c, payload.version_app, foto.url);
    return _json({ status: 'ok', fila: fila, foto_url: foto.url, carpeta: carpeta.getName(), version_script: VERSION_SCRIPT });
  } catch (err) {
    return _json({ status: 'error', mensaje: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

// Diagnóstico: abrir la URL /exec en el navegador muestra a qué planilla y a
// qué carpeta está conectado este deployment, y si la cuenta tiene acceso.
function doGet() {
  const r = { status: 'ok', mensaje: 'Colecta de semillas – Vivero Guayacanes – API activa', version_script: VERSION_SCRIPT };
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    r.planilla = ss.getName();
    r.planilla_url = ss.getUrl();
    r.hojas = ss.getSheets().map(function (h) { return h.getName(); });
  } catch (err) {
    r.status = 'error';
    r.mensaje = 'No se pudo abrir la planilla: ' + err;
  }
  try {
    r.carpeta = DriveApp.getFolderById(CARPETA_BD_ID).getName();
  } catch (err) {
    r.status = 'error';
    r.mensaje = 'No se pudo abrir la carpeta de fotos: ' + err;
  }
  return _json(r);
}

// ---------- Hoja ----------

function _hoja() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(HOJA);
  if (!sh) {
    // La planilla venía con una "Hoja 1" vacía: se reutiliza en vez de dejarla sobrando.
    const unica = ss.getSheets().length === 1 ? ss.getSheets()[0] : null;
    sh = unica && unica.getLastRow() === 0 ? unica.setName(HOJA) : ss.insertSheet(HOJA);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, COLUMNAS.length)
      .setValues([COLUMNAS.map(function (c) { return c[0]; })])
      .setFontWeight('bold')
      .setWrap(true)
      .setVerticalAlignment('middle');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Fila de la colecta (upsert): si ya existe su ID, se sobrescribe; si no, se agrega al final.
function _escribirFila(c, versionApp, fotoUrl) {
  const sh = _hoja();
  const ahora = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd HH:mm:ss');
  const valores = COLUMNAS.map(function (col) {
    const campo = col[1];
    if (campo === '_sincronizada') return ahora;
    if (campo === '_version_app') return versionApp || '';
    if (campo === 'foto_tomada' || campo === 'fecha_creacion') return _fechaHora(c[campo]);
    const v = c[campo];
    return v === null || v === undefined ? '' : v;
  });

  let fila = _filaDeId(sh, c.record_id);
  if (!fila) fila = sh.getLastRow() + 1;
  // Las fechas van como texto AAAA-MM-DD: así Sheets no las reinterpreta según
  // la configuración regional (18-11 vs 11-18) y se ordenan bien alfabéticamente.
  COLUMNAS.forEach(function (col, i) {
    if (COLUMNAS_TEXTO.indexOf(col[1]) !== -1) sh.getRange(fila, i + 1).setNumberFormat('@');
  });
  sh.getRange(fila, 1, 1, COLUMNAS.length).setValues([valores]);

  // El nombre de la foto queda como enlace al archivo en Drive.
  if (fotoUrl) {
    sh.getRange(fila, COL_FOTO).setRichTextValue(
      SpreadsheetApp.newRichTextValue().setText(c.foto_nombre).setLinkUrl(fotoUrl).build());
  }
  return fila;
}

function _filaDeId(sh, id) {
  if (sh.getLastRow() < 2) return 0;
  const celda = sh.getRange(2, COL_ID, sh.getLastRow() - 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
  return celda ? celda.getRow() : 0;
}

// ---------- Fotos ----------

// BD_Colecta de semillas / Fotografías / AAAAMMDD_Faena  (p. ej. 20261118_Santiago Solar).
// La fecha va primero para que, ordenadas por nombre, las carpetas queden en
// orden cronológico; la faena permite ubicar de un vistazo dónde se colectó.
function _carpetaDelDia(fechaIso, faena) {
  const base = DriveApp.getFolderById(CARPETA_BD_ID);
  const fotos = _subcarpeta(base, CARPETA_FOTOS);
  const dia = String(fechaIso || '').replace(/-/g, '') || 'sin_fecha';
  // Se quitan caracteres que confunden en nombres de carpeta (/ \ : * ? " < > |).
  const nombreFaena = String(faena || 'Sin faena').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return _subcarpeta(fotos, dia + '_' + nombreFaena);
}

function _subcarpeta(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

// Guarda la foto (dataURL base64). Si ya existe un archivo con ese nombre en la
// carpeta (reenvío), reutiliza ese en vez de duplicarlo.
function _guardarFoto(carpeta, dataUrl, nombre) {
  if (!dataUrl || !nombre) throw new Error('La colecta llegó sin fotografía');
  const existentes = carpeta.getFilesByName(nombre);
  if (existentes.hasNext()) return { url: existentes.next().getUrl(), nueva: false };
  const partes = String(dataUrl).split(',');
  const blob = Utilities.newBlob(Utilities.base64Decode(partes[1] || partes[0]), 'image/jpeg', nombre);
  return { url: carpeta.createFile(blob).getUrl(), nueva: true };
}

// ---------- Utilidades ----------

function _fechaHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? String(iso) : Utilities.formatDate(d, 'America/Santiago', 'yyyy-MM-dd HH:mm');
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
