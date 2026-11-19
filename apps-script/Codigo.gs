/**
 * Colecta de semillas — Vivero Guayacanes · Web App de sincronización.
 *
 * Recibe las colectas que envía la app del celular (botón "Sincronizar") y:
 *   1. guarda la fotografía en la unidad compartida, en una carpeta por fecha,
 *      faena y recolector:  BD_Colecta de semillas / Fotografías / AAAAMMDD_Faena_Recolector /
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
 * Correcciones (colectas editadas en la app): la fila se actualiza en su lugar
 * y la foto anterior se reutiliza a partir del enlace de esa fila: si solo
 * cambió la especie, la fecha, la faena o el recolector, se renombra y/o se mueve a su nueva
 * carpeta; si la imagen cambió (otra foto o nueva etiqueta), se sube la nueva y
 * la anterior va a la papelera. Nunca quedan dos fotos para una colecta.
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
// crea sola la carpeta de fotografías y, dentro de ella, una por fecha, faena y recolector.
const CARPETA_BD_ID = '1oBUJN5G3MpZLwHg74JM0deOOyUY6w7hd';
const CARPETA_FOTOS = 'Fotografías';

const HOJA = 'Colectas';
const VERSION_SCRIPT = 'v4';

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

    const sh = _hoja();
    const filaExistente = _filaDeId(sh, c.record_id);
    const carpeta = _carpetaDelDia(c.fecha, c.faena, c.recolector);
    const anterior = filaExistente ? _fotoDeFila(sh, filaExistente) : null;
    const foto = _guardarFoto(carpeta, c.foto, c.foto_nombre, anterior);
    const fila = _escribirFila(sh, filaExistente, c, payload.version_app, foto.url);
    const r = { status: 'ok', fila: fila, foto_url: foto.url, carpeta: carpeta.getName(), version_script: VERSION_SCRIPT };
    if (foto.aviso) r.aviso = foto.aviso;
    return _json(r);
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
function _escribirFila(sh, filaExistente, c, versionApp, fotoUrl) {
  const ahora = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd HH:mm:ss');
  const valores = COLUMNAS.map(function (col) {
    const campo = col[1];
    if (campo === '_sincronizada') return ahora;
    if (campo === '_version_app') return versionApp || '';
    if (campo === 'foto_tomada' || campo === 'fecha_creacion') return _fechaHora(c[campo]);
    const v = c[campo];
    return v === null || v === undefined ? '' : v;
  });

  const fila = filaExistente || sh.getLastRow() + 1;
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

// BD_Colecta de semillas / Fotografías / AAAAMMDD_Faena_Recolector
// (p. ej. 20261119_Canalistas_Vera Collao Patricia Isabel).
// La fecha va primero para que, ordenadas por nombre, las carpetas queden en
// orden cronológico; la faena y el recolector distinguen a dos personas que
// colectan el mismo día en la misma faena.
function _carpetaDelDia(fechaIso, faena, recolector) {
  const base = DriveApp.getFolderById(CARPETA_BD_ID);
  const fotos = _subcarpeta(base, CARPETA_FOTOS);
  const dia = String(fechaIso || '').replace(/-/g, '') || 'sin_fecha';
  return _subcarpeta(fotos, [dia, _limpio(faena, 'Sin faena'), _limpio(recolector, 'Sin recolector')].join('_'));
}

// Texto apto para un nombre de carpeta: sin / \ : * ? " < > | ni espacios repetidos.
function _limpio(texto, siVacio) {
  return String(texto || siVacio).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || siVacio;
}

function _subcarpeta(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

// Archivo de la foto enlazada en una fila (o null si no hay o ya está en la papelera).
function _fotoDeFila(sh, fila) {
  try {
    const rt = sh.getRange(fila, COL_FOTO).getRichTextValue();
    const url = rt && rt.getLinkUrl();
    const m = url && String(url).match(/[-\w]{25,}/);
    if (!m) return null;
    const archivo = DriveApp.getFileById(m[0]);
    return archivo.isTrashed() ? null : archivo;
  } catch (err) {
    return null;
  }
}

function _estaEn(archivo, carpeta) {
  const padres = archivo.getParents();
  while (padres.hasNext()) if (padres.next().getId() === carpeta.getId()) return true;
  return false;
}

// Guarda la foto (dataURL base64) y devuelve { url, aviso? }.
// - Colecta nueva: si ya existe un archivo con ese nombre en la carpeta
//   (reenvío), se reutiliza en vez de duplicarlo.
// - Colecta corregida (`anterior` = su foto actual): si la imagen es la misma
//   (mismo tamaño en bytes), solo se renombra y/o se mueve; si cambió, se sube
//   la nueva y la anterior va a la papelera.
function _guardarFoto(carpeta, dataUrl, nombre, anterior) {
  if (!dataUrl || !nombre) throw new Error('La colecta llegó sin fotografía');
  const partes = String(dataUrl).split(',');
  const bytes = Utilities.base64Decode(partes[1] || partes[0]);

  if (anterior && anterior.getSize() === bytes.length) {
    const avisos = [];
    if (anterior.getName() !== nombre) anterior.setName(nombre);
    if (!_estaEn(anterior, carpeta)) {
      try { anterior.moveTo(carpeta); } catch (err) { avisos.push('No se pudo mover la foto a ' + carpeta.getName() + ': ' + err); }
    }
    return { url: anterior.getUrl(), aviso: avisos.join(' ') };
  }

  // Un archivo con ese nombre que NO sea la foto anterior y tenga el mismo
  // tamaño es esta misma foto subida en un intento que se cortó: se reutiliza.
  let url = null;
  const existentes = carpeta.getFilesByName(nombre);
  while (!url && existentes.hasNext()) {
    const f = existentes.next();
    if ((!anterior || f.getId() !== anterior.getId()) && f.getSize() === bytes.length) url = f.getUrl();
  }
  if (!url) url = carpeta.createFile(Utilities.newBlob(bytes, 'image/jpeg', nombre)).getUrl();
  if (anterior && anterior.getUrl() !== url) {
    try {
      anterior.setTrashed(true);
    } catch (err) {
      return { url: url, aviso: 'Foto nueva subida, pero no se pudo enviar la anterior a la papelera (' + anterior.getName() + '): ' + err };
    }
  }
  return { url: url };
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
