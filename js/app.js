// Lógica principal — formulario de colecta de semillas (Vivero Guayacanes).
// Offline primero: todo se guarda en el celular (IndexedDB) y se exporta a Excel.
// La sincronización con Google Drive/Sheets es la etapa siguiente.
import * as DB from './db.js';
import { latLonToUTM, HUSO_TEXTO } from './utm.js';
import { Combobox } from './combobox.js';
import * as XP from './export.js';
import {
  PROYECTO, OPCION_OTRO, RECOLECTORES, FAENAS, HABITOS, ESTADOS_IDENTIFICACION,
  MOMENTOS_COLECTA, ORIGENES_SEMILLA, ESPECIES, CUENCAS, TERRITORIO,
} from './catalog.js';

const VERSION = 'v1';

const $ = (id) => document.getElementById(id);
const form = $('form-colecta');
const campo = (f) => form.querySelector(`[data-f="${f}"]`);

// ---------- Utilidades UI ----------
let toastTimer = null;
function toast(msg, ms = 2800) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function llenarSelect(sel, opciones) {
  sel.innerHTML = '<option value="">— Selecciona —</option>' +
    opciones.map((o) => `<option>${o}</option>`).join('');
}

function hoyLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Listas con opción "Otro (especificar)": muestra u oculta el campo de texto libre.
function wireOtro(nombre, getValor) {
  const wrap = form.querySelector(`[data-otro="${nombre}"]`);
  return () => {
    const otro = getValor() === OPCION_OTRO;
    wrap.classList.toggle('hidden', !otro);
    if (!otro) wrap.querySelector('input').value = '';
  };
}

// ---------- Especie: nombre científico <-> nombre común ----------
// Cada nombre científico tiene un único nombre común, pero un mismo nombre común
// puede corresponder a varias especies (p. ej. "Cactus" a 18). Por eso:
//  - al elegir el científico, el común se completa siempre;
//  - al elegir el común, el científico se completa si es único; si hay varios,
//    la lista de científicos se reduce a esos y se pide elegir uno.
const COMUN_DE = new Map(ESPECIES.map(([c, n]) => [c, n]));
const CIENTIFICOS_DE = new Map();
for (const [c, n] of ESPECIES) {
  if (!CIENTIFICOS_DE.has(n)) CIENTIFICOS_DE.set(n, []);
  CIENTIFICOS_DE.get(n).push(c);
}
const TODOS_CIENTIFICOS = ESPECIES.map(([c]) => c);
const TODOS_COMUNES = [...CIENTIFICOS_DE.keys()].sort((a, b) => a.localeCompare(b, 'es'));

let filtroCientificos = null; // null = todos
let cbCientifico, cbComun;

function avisoEspecie(texto, warn = false) {
  const h = $('hint-especie');
  h.textContent = texto || 'Al elegir uno de los dos nombres, el otro se completa solo.';
  h.classList.toggle('warn', warn);
}

function setupEspecie() {
  cbCientifico = new Combobox($('f-cientifico'), {
    opciones: () => filtroCientificos || TODOS_CIENTIFICOS,
    onCambio: (c) => {
      if (c) {
        cbComun.fijar(COMUN_DE.get(c));
        filtroCientificos = null;
        avisoEspecie();
      }
    },
  });
  cbComun = new Combobox($('f-comun'), {
    opciones: () => TODOS_COMUNES,
    onCambio: (n) => {
      const candidatos = n ? CIENTIFICOS_DE.get(n) : null;
      if (!candidatos) {
        filtroCientificos = null;
        avisoEspecie();
      } else if (candidatos.length === 1) {
        filtroCientificos = null;
        cbCientifico.fijar(candidatos[0]);
        avisoEspecie();
      } else {
        filtroCientificos = candidatos;
        if (!candidatos.includes(cbCientifico.valor)) cbCientifico.fijar('');
        avisoEspecie(`Hay ${candidatos.length} especies con el nombre común «${n}». Elige el nombre científico.`, true);
      }
    },
  });
}

// ---------- Región -> Provincia -> Comuna ----------
let cbRegion, cbProvincia, cbComuna;

function setupTerritorio() {
  cbRegion = new Combobox($('f-region'), {
    opciones: () => Object.keys(TERRITORIO),
    onCambio: () => {
      cbProvincia.fijar('');
      cbComuna.fijar('');
      actualizarTerritorio();
    },
  });
  cbProvincia = new Combobox($('f-provincia'), {
    opciones: () => Object.keys(TERRITORIO[cbRegion.valor] || {}),
    onCambio: () => {
      cbComuna.fijar('');
      actualizarTerritorio();
    },
  });
  cbComuna = new Combobox($('f-comuna'), {
    opciones: () => (TERRITORIO[cbRegion.valor] || {})[cbProvincia.valor] || [],
  });
}

function actualizarTerritorio() {
  const hayRegion = !!cbRegion.valor;
  const hayProvincia = hayRegion && !!cbProvincia.valor;
  cbProvincia.habilitar(hayRegion);
  cbComuna.habilitar(hayProvincia);
  $('f-provincia').placeholder = hayRegion ? 'Escribe para buscar…' : 'Primero elige la región';
  $('f-comuna').placeholder = hayProvincia ? 'Escribe para buscar…' : 'Primero elige la provincia';
}

// ---------- Cuenca (con "Otro") ----------
let cbCuenca, toggleCuencaOtro;

function setupCuenca() {
  cbCuenca = new Combobox($('f-cuenca'), {
    opciones: () => [...CUENCAS, OPCION_OTRO],
    onCambio: () => toggleCuencaOtro(),
  });
  toggleCuencaOtro = wireOtro('cuenca', () => cbCuenca.valor);
}

// ---------- Punto GPS ----------
// `punto` guarda lo capturado; Este/Norte se muestran en sus campos (solo lectura).
let punto = null;

function obtenerPosicion() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Este dispositivo no tiene GPS disponible')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new Error(err.code === 1 ? 'Permiso de ubicación denegado' : err.message || 'No se pudo obtener la ubicación')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

async function tomarPunto() {
  const btn = $('btn-punto');
  btn.disabled = true;
  btn.textContent = '📍 Obteniendo ubicación…';
  try {
    const c = await obtenerPosicion();
    const utm = latLonToUTM(c.latitude, c.longitude);
    punto = { ...utm, lat: c.latitude, lon: c.longitude, precision_m: Math.round(c.accuracy) };
    campo('utm_este').value = utm.este;
    campo('utm_norte').value = utm.norte;
    campo('utm_este').classList.remove('invalido');
    campo('utm_norte').classList.remove('invalido');
    $('gps-info').textContent = `UTM ${utm.huso} (WGS84) · precisión ±${punto.precision_m} m`;
    btn.textContent = '📍 Volver a tomar el punto';
    toast('Punto de la muestra registrado');
    // Si ya había foto, se vuelve a etiquetar con las coordenadas nuevas.
    if (foto) await etiquetarFoto();
    return true;
  } catch (err) {
    btn.textContent = punto ? '📍 Volver a tomar el punto' : '📍 Tomar punto de la muestra';
    toast('GPS: ' + err.message, 4000);
    return false;
  } finally {
    btn.disabled = false;
  }
}

// ---------- Fotografía con etiqueta ----------
// La etiqueta se dibuja sobre los píxeles de la imagen (Canvas), no en los
// metadatos EXIF, porque WhatsApp, Drive y otras apps suelen borrar los EXIF.
// Se guarda el archivo original en memoria para poder re-etiquetar si se vuelve
// a tomar el punto después de la foto.
let foto = null; // { archivo, tomada: Date, dataUrl }

function fechaHora(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function lineasEtiqueta() {
  return [
    PROYECTO.nombre,
    `Fecha: ${fechaHora(foto.tomada)}`,
    `UTM ${punto.huso}: ${punto.este} E · ${punto.norte} N`,
  ];
}

function cargarImagen(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

async function etiquetarFoto() {
  const img = await cargarImagen(foto.archivo);
  const maxLado = 1600;
  const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
  const w = Math.round(img.width * escala);
  const h = Math.round(img.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const lineas = lineasEtiqueta();
  // Letra proporcional a la foto, achicada hasta que la línea más larga quepa.
  let fs = Math.max(16, Math.round(Math.min(w, h) * 0.04));
  const anchoMax = (t) => {
    ctx.font = `bold ${t}px sans-serif`;
    return Math.max(...lineas.map((l) => ctx.measureText(l).width));
  };
  while (fs > 10 && anchoMax(fs) > w - fs * 2) fs -= 1;
  ctx.font = `bold ${fs}px sans-serif`;
  const pad = Math.round(fs * 0.6);
  const altoLinea = Math.round(fs * 1.35);
  const altoCaja = altoLinea * lineas.length + pad * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, h - altoCaja, w, altoCaja);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';
  lineas.forEach((l, i) => ctx.fillText(l, pad, h - altoCaja + pad + i * altoLinea));

  foto.dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const prev = $('foto-preview');
  prev.querySelector('img').src = foto.dataUrl;
  prev.classList.remove('hidden');
  $('lbl-foto').classList.remove('invalido');
  $('lbl-foto').textContent = '📷 Cambiar fotografía';
}

async function alElegirFoto(e) {
  const archivo = e.target.files[0];
  e.target.value = ''; // permite volver a elegir el mismo archivo
  if (!archivo) return;
  // La etiqueta necesita coordenadas: si aún no se toma el punto, se toma ahora.
  if (!punto) {
    toast('Tomando el punto de la muestra para la etiqueta…');
    if (!(await tomarPunto())) {
      toast('No se pudo etiquetar la foto: primero toma el punto de la muestra', 4500);
      return;
    }
  }
  foto = { archivo, tomada: new Date(), dataUrl: null };
  try {
    await etiquetarFoto();
  } catch (err) {
    foto = null;
    toast(err.message, 4000);
  }
}

function quitarFoto() {
  foto = null;
  $('foto-preview').classList.add('hidden');
  $('foto-preview').querySelector('img').removeAttribute('src');
  $('lbl-foto').textContent = '📷 Tomar o adjuntar fotografía';
}

// ---------- Guardar ----------
function valorOtro(selVal, otroCampo, mayus = false) {
  if (selVal !== OPCION_OTRO) return selVal;
  const v = campo(otroCampo).value.trim();
  return mayus ? v.toUpperCase() : v;
}

// Revisa todos los campos. Devuelve la lista de elementos con problema.
function validar() {
  const faltan = [];
  const marcar = (el, motivo) => { el.classList.add('invalido'); faltan.push({ el, nombre: el.dataset.nombre, motivo }); };
  form.querySelectorAll('.invalido').forEach((el) => el.classList.remove('invalido'));

  const requeridos = ['fecha', 'recolector', 'faena', 'nombre_cientifico', 'nombre_comun', 'habito',
    'estado_identificacion', 'momento_colecta', 'cuenca', 'region', 'provincia', 'comuna',
    'utm_este', 'utm_norte', 'semillas_de', 'cantidad_gramos', 'comentarios'];
  // Los combobox ya vacían lo que no es de la lista, así que basta con revisar vacíos.
  for (const f of requeridos) {
    const el = campo(f);
    if (!String(el.value).trim()) marcar(el);
    if (f === 'fecha' && el.value && el.value > hoyLocal()) marcar(el, 'no puede ser posterior a hoy');
    if (f === 'cantidad_gramos' && el.value !== '' && !(Number(el.value) > 0)) marcar(el, 'debe ser mayor que 0');
  }
  if (campo('recolector').value === OPCION_OTRO && !campo('recolector_otro').value.trim()) marcar(campo('recolector_otro'));
  if (campo('faena').value === OPCION_OTRO && !campo('faena_otro').value.trim()) marcar(campo('faena_otro'));
  if (cbCuenca.valor === OPCION_OTRO && !campo('cuenca_otro').value.trim()) marcar(campo('cuenca_otro'));
  if (!foto || !foto.dataUrl) marcar($('lbl-foto'));
  return faltan;
}

function mostrarErrores(faltan) {
  const box = $('errores');
  if (!faltan.length) { box.classList.add('hidden'); return; }
  box.innerHTML = '<strong>No se puede guardar: falta completar</strong><ul>' +
    faltan.map((x) => `<li>${x.nombre}${x.motivo ? ` (${x.motivo})` : ''}</li>`).join('') + '</ul>';
  box.classList.remove('hidden');
}

function nuevoUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function nombreFoto(reg) {
  const especie = reg.nombre_cientifico.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `colecta_${reg.fecha}_${especie}_${reg.record_id.slice(0, 8)}.jpg`;
}

async function guardar(e) {
  e.preventDefault();
  // Confirma lo que haya quedado escrito en un combobox sin salir del campo.
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

  const faltan = validar();
  mostrarErrores(faltan);
  if (faltan.length) {
    faltan[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(`Faltan ${faltan.length} dato(s) por completar`);
    return;
  }

  const reg = {
    record_id: nuevoUUID(),
    fecha: campo('fecha').value,
    recolector: valorOtro(campo('recolector').value, 'recolector_otro'),
    faena: valorOtro(campo('faena').value, 'faena_otro', true),
    nombre_cientifico: cbCientifico.valor,
    nombre_comun: cbComun.valor,
    habito: campo('habito').value,
    estado_identificacion: campo('estado_identificacion').value,
    momento_colecta: campo('momento_colecta').value,
    cuenca: valorOtro(cbCuenca.valor, 'cuenca_otro'),
    region: cbRegion.valor,
    provincia: cbProvincia.valor,
    comuna: cbComuna.valor,
    utm_este: punto.este,
    utm_norte: punto.norte,
    huso: punto.huso,
    latitud: punto.lat,
    longitud: punto.lon,
    precision_m: punto.precision_m,
    semillas_de: campo('semillas_de').value,
    cantidad_gramos: Number(campo('cantidad_gramos').value),
    comentarios: campo('comentarios').value.trim(),
    foto: foto.dataUrl,
    foto_tomada: foto.tomada.toISOString(),
  };
  reg.foto_nombre = nombreFoto(reg);

  try {
    await DB.addColecta(reg);
  } catch (err) {
    toast('Error al guardar: ' + err.message, 5000);
    return;
  }
  toast('✅ Colecta guardada');
  limpiar(true);
  await refrescarLista();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Deja el formulario listo para la siguiente colecta. Con `conservar`, mantiene
// lo que suele repetirse en una misma salida (fecha, recolector, faena, cuenca y
// territorio) para no volver a escribirlo.
function limpiar(conservar = false) {
  const guardados = conservar ? {
    fecha: campo('fecha').value,
    recolector: campo('recolector').value, recolector_otro: campo('recolector_otro').value,
    faena: campo('faena').value, faena_otro: campo('faena_otro').value,
    cuenca: cbCuenca.valor, cuenca_otro: campo('cuenca_otro').value,
    region: cbRegion.valor, provincia: cbProvincia.valor, comuna: cbComuna.valor,
  } : null;

  form.reset();
  form.querySelectorAll('.invalido').forEach((el) => el.classList.remove('invalido'));
  [cbCientifico, cbComun, cbCuenca, cbRegion, cbProvincia, cbComuna].forEach((cb) => cb.fijar(''));
  filtroCientificos = null;
  avisoEspecie();
  punto = null;
  $('btn-punto').textContent = '📍 Tomar punto de la muestra';
  $('gps-info').textContent = `Coordenadas UTM huso ${HUSO_TEXTO.replace('S', ' Sur')} (WGS84).`;
  quitarFoto();
  mostrarErrores([]);
  campo('fecha').value = hoyLocal();

  if (guardados) {
    campo('fecha').value = guardados.fecha;
    campo('recolector').value = guardados.recolector;
    campo('recolector_otro').value = guardados.recolector_otro;
    campo('faena').value = guardados.faena;
    campo('faena_otro').value = guardados.faena_otro;
    cbCuenca.fijar(guardados.cuenca);
    campo('cuenca_otro').value = guardados.cuenca_otro;
    cbRegion.fijar(guardados.region);
    cbProvincia.fijar(guardados.provincia);
    cbComuna.fijar(guardados.comuna);
  }
  form.querySelectorAll('[data-otro]').forEach((w) => {
    const input = w.querySelector('input');
    w.classList.toggle('hidden', !input.value);
  });
  actualizarTerritorio();
}

// ---------- Lista de colectas ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function refrescarLista() {
  const regs = (await DB.getColectas()).sort((a, b) => (b.fecha_creacion || '').localeCompare(a.fecha_creacion || ''));
  $('count').textContent = regs.length;
  const lista = $('lista');
  if (!regs.length) {
    lista.innerHTML = '<p class="empty">Aún no hay colectas guardadas.</p>';
    return;
  }
  lista.innerHTML = regs.map((r) => `
    <div class="card" data-id="${r.id}">
      <img class="card-foto" src="${r.foto}" alt="" />
      <div class="card-main">
        <div><em>${esc(r.nombre_cientifico)}</em> · ${esc(r.nombre_comun)}</div>
        <div class="card-sub">${esc(r.fecha)} · ${esc(r.comuna)} · ${esc(r.cantidad_gramos)} g · ${esc(r.recolector)}</div>
        <div class="card-sub">UTM ${esc(r.huso)}: ${esc(r.utm_este)} E · ${esc(r.utm_norte)} N</div>
      </div>
      <div class="card-actions">
        <button class="btn-mini" data-accion="foto" title="Descargar foto">🖼️</button>
        <button class="btn-mini danger" data-accion="borrar" title="Eliminar">🗑️</button>
      </div>
    </div>`).join('');
}

async function accionLista(e) {
  const btn = e.target.closest('button[data-accion]');
  if (!btn) return;
  const id = Number(btn.closest('.card').dataset.id);
  const reg = await DB.getColecta(id);
  if (!reg) return;
  if (btn.dataset.accion === 'foto') {
    XP.descargarFoto(reg);
  } else if (btn.dataset.accion === 'borrar') {
    if (!confirm(`¿Eliminar la colecta de ${reg.nombre_cientifico} del ${reg.fecha}? No se puede deshacer.`)) return;
    await DB.deleteColecta(id);
    toast('Colecta eliminada');
    await refrescarLista();
  }
}

// ---------- Navegación y arranque ----------
function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab.dataset.view));
      window.scrollTo({ top: 0 });
    });
  });
}

function setupNetwork() {
  const el = $('net-status');
  const upd = () => {
    el.classList.toggle('online', navigator.onLine);
    el.title = navigator.onLine ? 'Con conexión' : 'Sin conexión (los datos se guardan igual)';
  };
  window.addEventListener('online', upd);
  window.addEventListener('offline', upd);
  upd();
}

async function exportar(fn) {
  const regs = await DB.getColectas();
  if (!regs.length) { toast('No hay colectas para exportar'); return; }
  fn(regs);
}

function init() {
  llenarSelect(campo('recolector'), RECOLECTORES);
  llenarSelect(campo('faena'), FAENAS);
  llenarSelect(campo('habito'), HABITOS);
  llenarSelect(campo('estado_identificacion'), ESTADOS_IDENTIFICACION);
  llenarSelect(campo('momento_colecta'), MOMENTOS_COLECTA);
  llenarSelect(campo('semillas_de'), ORIGENES_SEMILLA);
  campo('fecha').max = hoyLocal();

  setupEspecie();
  setupTerritorio();
  setupCuenca();
  const toggleRecolector = wireOtro('recolector', () => campo('recolector').value);
  const toggleFaena = wireOtro('faena', () => campo('faena').value);
  campo('recolector').addEventListener('change', toggleRecolector);
  campo('faena').addEventListener('change', toggleFaena);
  // "Otros" en faena: se escribe solo en mayúsculas.
  campo('faena_otro').addEventListener('input', (e) => {
    const pos = e.target.selectionStart;
    e.target.value = e.target.value.toUpperCase();
    e.target.setSelectionRange(pos, pos);
  });
  // Al corregir un campo marcado, se quita la marca roja.
  form.addEventListener('input', (e) => e.target.classList.remove('invalido'));
  form.addEventListener('change', (e) => e.target.classList.remove('invalido'));

  $('btn-punto').addEventListener('click', tomarPunto);
  $('f-foto').addEventListener('change', alElegirFoto);
  $('btn-quitar-foto').addEventListener('click', quitarFoto);
  $('btn-limpiar').addEventListener('click', () => { if (confirm('¿Borrar todo lo escrito en el formulario?')) limpiar(); });
  form.addEventListener('submit', guardar);
  $('lista').addEventListener('click', accionLista);
  $('btn-excel').addEventListener('click', () => exportar(XP.descargarExcel));
  $('btn-fotos').addEventListener('click', () => exportar(XP.descargarFotosZip));
  $('version').textContent = VERSION;

  setupTabs();
  setupNetwork();
  limpiar();
  refrescarLista();
}

init();
