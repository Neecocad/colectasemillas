// Lógica principal — formulario de colecta de semillas (Vivero Guayacanes).
// Offline primero: todo se guarda en el celular (IndexedDB) y se exporta a Excel.
// La sincronización con Google Drive/Sheets es la etapa siguiente.
import * as DB from './db.js';
import { latLonToUTM, HUSO_TEXTO } from './utm.js';
import { Combobox } from './combobox.js';
import * as XP from './export.js';
import * as SYNC from './sync.js';
import {
  PROYECTO, OPCION_OTRO, RECOLECTORES, FAENAS, HABITOS, ESTADOS_IDENTIFICACION,
  MOMENTOS_COLECTA, ORIGENES_SEMILLA, ESPECIES, CUENCAS, TERRITORIO,
} from './catalog.js';

const VERSION = 'v7';

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
      reetiquetar();
    },
  });
  cbProvincia = new Combobox($('f-provincia'), {
    opciones: () => Object.keys(TERRITORIO[cbRegion.valor] || {}),
    onCambio: () => {
      cbComuna.fijar('');
      actualizarTerritorio();
      reetiquetar();
    },
  });
  cbComuna = new Combobox($('f-comuna'), {
    opciones: () => (TERRITORIO[cbRegion.valor] || {})[cbProvincia.valor] || [],
    onCambio: () => reetiquetar(),
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

let toggleFaenaOtro;

// ---------- Recolector (nómina + "Otro") ----------
let cbRecolector, toggleRecolectorOtro;

function setupRecolector() {
  cbRecolector = new Combobox($('f-recolector'), {
    opciones: () => RECOLECTORES,
    onCambio: () => toggleRecolectorOtro(),
  });
  toggleRecolectorOtro = wireOtro('recolector', () => cbRecolector.valor);
}

// ---------- Cuenca (con "Otro") ----------
let cbCuenca, toggleCuencaOtro;

function setupCuenca() {
  cbCuenca = new Combobox($('f-cuenca'), {
    opciones: () => [...CUENCAS, OPCION_OTRO],
    onCambio: () => { toggleCuencaOtro(); reetiquetar(); },
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
// Mientras se registra una colecta nueva, el archivo original queda en memoria
// para poder re-etiquetar si cambian la ubicación o el punto antes de guardar.
// Al editar una colecta guardada no hay archivo original: la foto ya
// etiquetada se conserva tal cual (ver editar()).
let foto = null; // { archivo, tomada: Date, dataUrl, etiqueta }

function fechaHora(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Lo que dice la etiqueta. Cuenca, provincia y comuna se leen del formulario en
// el momento de dibujar; si aún no se eligen aparece "—", y la etiqueta se
// vuelve a dibujar cuando se completan y, en todo caso, al guardar.
function lineasEtiqueta() {
  const o = (v) => v || '—';
  return [
    PROYECTO.nombre,
    `Fecha: ${fechaHora(foto.tomada)}`,
    `UTM ${punto.huso}: ${punto.este} E · ${punto.norte} N`,
    `Cuenca: ${o(valorOtro(cbCuenca.valor, 'cuenca_otro'))}`,
    `Provincia: ${o(cbProvincia.valor)} · Comuna: ${o(cbComuna.valor)}`,
  ];
}

// Corta una línea en varias para que quepa en `ancho` (por palabras).
function cortarLinea(ctx, texto, ancho) {
  const palabras = texto.split(' ');
  const out = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (actual && ctx.measureText(prueba).width > ancho) { out.push(actual); actual = p; }
    else actual = prueba;
  }
  if (actual) out.push(actual);
  return out;
}

// Re-dibuja la etiqueta si ya hay foto (p. ej. al cambiar cuenca o comuna).
function reetiquetar() {
  if (foto && foto.archivo && punto) etiquetarFoto().catch(() => {});
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
  // Colecta en edición: la foto se conserva tal como está.
  if (!foto.archivo) return;
  const img = await cargarImagen(foto.archivo);
  const maxLado = 1600;
  const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
  const w = Math.round(img.width * escala);
  const h = Math.round(img.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const textos = lineasEtiqueta();
  // Letra proporcional a la foto, achicada hasta que la línea más larga quepa,
  // pero sin bajar de un mínimo legible: lo que igual no quepa (p. ej. una
  // cuenca de nombre largo) se corta en dos líneas.
  let fs = Math.max(16, Math.round(Math.min(w, h) * 0.038));
  const fsMin = Math.max(12, Math.round(Math.min(w, h) * 0.026));
  const anchoMax = (t) => {
    ctx.font = `bold ${t}px sans-serif`;
    return Math.max(...textos.map((l) => ctx.measureText(l).width));
  };
  while (fs > fsMin && anchoMax(fs) > w - fs * 2) fs -= 1;
  ctx.font = `bold ${fs}px sans-serif`;
  const pad = Math.round(fs * 0.6);
  const lineas = textos.flatMap((l) => cortarLinea(ctx, l, w - pad * 2));
  const altoLinea = Math.round(fs * 1.35);
  const altoCaja = altoLinea * lineas.length + pad * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, h - altoCaja, w, altoCaja);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';
  lineas.forEach((l, i) => ctx.fillText(l, pad, h - altoCaja + pad + i * altoLinea));

  foto.dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  foto.etiqueta = textos.join(' | '); // lo que dice la etiqueta dibujada
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
    'utm_este', 'utm_norte', 'semillas_de', 'cantidad_gramos']; // Comentarios es opcional
  // Los combobox ya vacían lo que no es de la lista, así que basta con revisar vacíos.
  for (const f of requeridos) {
    const el = campo(f);
    if (!String(el.value).trim()) marcar(el);
    if (f === 'fecha' && el.value && el.value > hoyLocal()) marcar(el, 'no puede ser posterior a hoy');
    if (f === 'cantidad_gramos' && el.value !== '' && !(Number(el.value) > 0)) marcar(el, 'debe ser mayor que 0');
  }
  if (cbRecolector.valor === OPCION_OTRO && !campo('recolector_otro').value.trim()) marcar(campo('recolector_otro'));
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
  // La etiqueta se dibuja de nuevo con los datos definitivos (cuenca, provincia,
  // comuna), por si se cambiaron después de tomar la foto. Si dice exactamente
  // lo mismo (p. ej. al corregir solo la especie) la foto no se toca: así queda
  // idéntica y en Drive solo se renombra, sin volver a subirla.
  try {
    if (!editando && foto.etiqueta !== lineasEtiqueta().join(' | ')) await etiquetarFoto();
  } catch (err) {
    toast('No se pudo preparar la foto: ' + err.message, 5000);
    return;
  }

  const reg = {
    record_id: editando ? editando.record_id : nuevoUUID(),
    fecha: campo('fecha').value,
    recolector: valorOtro(cbRecolector.valor, 'recolector_otro', true),
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
  // El nombre del archivo incluye la especie: si se corrige la especie, cambia
  // el nombre, y el script renombra la foto en Drive en vez de duplicarla.
  reg.foto_nombre = nombreFoto(reg);

  const eraEdicion = !!editando;
  try {
    if (editando) {
      // Misma colecta (mismo id local y mismo record_id): se reemplaza y queda
      // pendiente, para que la próxima sincronización actualice su fila.
      Object.assign(reg, {
        id: editando.id,
        fecha_creacion: editando.fecha_creacion,
        sincronizado: 0,
        estado_sincronizacion: 'Pendiente',
        editada: (editando.editada || 0) + 1,
      });
      await DB.updateColecta(reg);
    } else {
      await DB.addColecta(reg);
    }
  } catch (err) {
    toast('Error al guardar: ' + err.message, 5000);
    return;
  }
  if (eraEdicion) {
    toast('✅ Corrección guardada: sincroniza para actualizar la planilla', 4000);
    limpiar();
    await refrescarLista();
    irA('list');
  } else {
    toast('✅ Colecta guardada');
    recordarSalida();
    limpiar();
    await refrescarLista();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Editar una colecta guardada ----------
// Se carga en el mismo formulario, con las mismas validaciones. Al guardar
// reemplaza a la colecta original (no crea otra) y la deja pendiente.
//
// La foto y el punto GPS quedan BLOQUEADOS: las correcciones suelen hacerse
// después, lejos del lugar de colecta (p. ej. corregir el nombre científico en
// la oficina), donde ya no se puede volver a fotografiar el individuo ni tomar
// su punto. Se conservan siempre tal como se registraron en terreno; si se
// corrige la ubicación, la etiqueta de la foto mantiene los datos originales.
let editando = null;

// Pone un valor en una lista con "Otro": si no está entre las opciones, elige
// "Otro (especificar)" y lo escribe en el campo de texto.
function fijarConOtro(valor, opciones, fijar, otroCampo, toggle) {
  const esOtro = !!valor && !opciones.includes(valor);
  fijar(esOtro ? OPCION_OTRO : (valor || ''));
  toggle(); // muestra u oculta (y vacía) el campo de texto libre
  if (esOtro) campo(otroCampo).value = valor;
}

async function editar(reg) {
  if (!editando && formularioConDatos() &&
      !confirm('El formulario tiene datos de una colecta nueva sin guardar. ¿Descartarlos para editar esta colecta?')) return;
  limpiar();
  editando = reg;
  campo('fecha').value = reg.fecha;
  fijarConOtro(reg.recolector, RECOLECTORES, (v) => cbRecolector.fijar(v), 'recolector_otro', toggleRecolectorOtro);
  fijarConOtro(reg.faena, FAENAS, (v) => { campo('faena').value = v; }, 'faena_otro', toggleFaenaOtro);
  cbCientifico.fijar(reg.nombre_cientifico);
  cbComun.fijar(reg.nombre_comun);
  campo('habito').value = reg.habito;
  campo('estado_identificacion').value = reg.estado_identificacion;
  campo('momento_colecta').value = reg.momento_colecta;
  fijarConOtro(reg.cuenca, CUENCAS, (v) => cbCuenca.fijar(v), 'cuenca_otro', toggleCuencaOtro);
  cbRegion.fijar(reg.region);
  cbProvincia.fijar(reg.provincia);
  cbComuna.fijar(reg.comuna);
  actualizarTerritorio();
  punto = { huso: reg.huso, este: reg.utm_este, norte: reg.utm_norte, lat: reg.latitud, lon: reg.longitud, precision_m: reg.precision_m };
  campo('utm_este').value = reg.utm_este;
  campo('utm_norte').value = reg.utm_norte;
  $('gps-info').textContent = `UTM ${reg.huso} (WGS84) · precisión ±${reg.precision_m} m`;
  foto = { archivo: null, tomada: new Date(reg.foto_tomada), dataUrl: reg.foto };
  const prev = $('foto-preview');
  prev.querySelector('img').src = reg.foto;
  prev.classList.remove('hidden');
  bloquearFotoYPunto(true);
  campo('semillas_de').value = reg.semillas_de;
  campo('cantidad_gramos').value = reg.cantidad_gramos;
  campo('comentarios').value = reg.comentarios || '';

  $('aviso-edicion-especie').textContent = `${reg.nombre_cientifico} · ${reg.fecha}`;
  $('aviso-edicion').classList.remove('hidden');
  $('btn-guardar').textContent = '💾 Guardar corrección';
  $('btn-limpiar').textContent = 'Cancelar';
  irA('form');
}

// En edición: sin botones para tomar el punto, cambiar o quitar la foto.
function bloquearFotoYPunto(si) {
  ['btn-punto', 'lbl-foto', 'btn-quitar-foto'].forEach((id) => $(id).classList.toggle('hidden', si));
  $('aviso-foto-edicion').classList.toggle('hidden', !si);
  $('aviso-punto-edicion').classList.toggle('hidden', !si);
}

function cancelarEdicion() {
  limpiar();
  irA('list');
}

// ¿Hay algo escrito en el formulario de una colecta nueva? (para no perderlo)
function formularioConDatos() {
  return !!(cbCientifico.valor || cbComun.valor || foto || punto || campo('cantidad_gramos').value ||
    campo('comentarios').value.trim());
}

// ---------- Datos de la salida (se repiten entre colectas del mismo día) ----------
// Al guardar, se recuerdan fecha, recolector, faena, cuenca y región/provincia/
// comuna en el almacenamiento del navegador (localStorage), junto con el día en
// que se guardaron. Se vuelven a poner en el formulario solo si ese día es hoy:
// al día siguiente el formulario parte en blanco.
const CLAVE_SALIDA = 'colecta-semillas:salida';

function datosSalida() {
  return {
    fecha: campo('fecha').value,
    recolector: cbRecolector.valor, recolector_otro: campo('recolector_otro').value,
    faena: campo('faena').value, faena_otro: campo('faena_otro').value,
    cuenca: cbCuenca.valor, cuenca_otro: campo('cuenca_otro').value,
    region: cbRegion.valor, provincia: cbProvincia.valor, comuna: cbComuna.valor,
  };
}

function recordarSalida() {
  try {
    localStorage.setItem(CLAVE_SALIDA, JSON.stringify({ dia: hoyLocal(), datos: datosSalida() }));
  } catch { /* sin almacenamiento disponible: simplemente no se recuerda */ }
}

function olvidarSalida() {
  try { localStorage.removeItem(CLAVE_SALIDA); } catch { /* nada que olvidar */ }
}

function salidaDeHoy() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SALIDA));
    return s && s.dia === hoyLocal() ? s.datos : null;
  } catch {
    return null;
  }
}

// Deja el formulario en blanco para la siguiente colecta y repone los datos de
// la salida si se guardó alguna colecta hoy.
function limpiar() {
  editando = null;
  $('aviso-edicion').classList.add('hidden');
  $('btn-guardar').textContent = '💾 Guardar colecta';
  $('btn-limpiar').textContent = 'Limpiar';
  bloquearFotoYPunto(false);
  form.reset();
  form.querySelectorAll('.invalido').forEach((el) => el.classList.remove('invalido'));
  [cbRecolector, cbCientifico, cbComun, cbCuenca, cbRegion, cbProvincia, cbComuna].forEach((cb) => cb.fijar(''));
  filtroCientificos = null;
  avisoEspecie();
  punto = null;
  $('btn-punto').textContent = '📍 Tomar punto de la muestra';
  $('gps-info').textContent = `Coordenadas UTM huso ${HUSO_TEXTO.replace('S', ' Sur')} (WGS84).`;
  quitarFoto();
  mostrarErrores([]);
  campo('fecha').max = hoyLocal();
  campo('fecha').value = hoyLocal();

  const salida = salidaDeHoy();
  if (salida) {
    campo('fecha').value = salida.fecha;
    cbRecolector.fijar(salida.recolector);
    campo('recolector_otro').value = salida.recolector_otro;
    campo('faena').value = salida.faena;
    campo('faena_otro').value = salida.faena_otro;
    cbCuenca.fijar(salida.cuenca);
    campo('cuenca_otro').value = salida.cuenca_otro;
    cbRegion.fijar(salida.region);
    cbProvincia.fijar(salida.provincia);
    cbComuna.fijar(salida.comuna);
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
  const pendientes = regs.filter((r) => !r.sincronizado).length;
  $('count').textContent = regs.length;
  $('n-pendientes').textContent = pendientes;
  $('n-sincronizadas').textContent = regs.length - pendientes;
  $('badge-pend').textContent = pendientes;
  $('badge-pend').classList.toggle('hidden', !pendientes);
  const lista = $('lista');
  if (!regs.length) {
    lista.innerHTML = '<p class="empty">Aún no hay colectas guardadas.</p>';
    return;
  }
  lista.innerHTML = regs.map((r) => `
    <div class="card" data-id="${r.id}">
      <img class="card-foto" src="${r.foto}" alt="" />
      <div class="card-main">
        <div><em>${esc(r.nombre_cientifico)}</em> · ${esc(r.nombre_comun)}
          ${r.sincronizado ? '<span class="tag ok">✓ Sincronizada</span>' : '<span class="tag">Pendiente</span>'}</div>
        <div class="card-sub">${esc(r.fecha)} · ${esc(r.comuna)} · ${esc(r.cantidad_gramos)} g · ${esc(r.recolector)}</div>
        <div class="card-sub">UTM ${esc(r.huso)}: ${esc(r.utm_este)} E · ${esc(r.utm_norte)} N</div>
        ${!r.sincronizado && r.error_sincronizacion ? `<div class="card-sub error">Último intento: ${esc(r.error_sincronizacion)}</div>` : ''}
      </div>
      <div class="card-actions">
        <button class="btn-mini" data-accion="editar" title="Editar">✏️</button>
        <button class="btn-mini" data-accion="foto" title="Descargar foto">🖼️</button>
        ${r.sincronizado ? '<button class="btn-mini" data-accion="reenviar" title="Volver a enviar">↻</button>' : ''}
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
  if (btn.dataset.accion === 'editar') {
    await editar(reg);
  } else if (btn.dataset.accion === 'foto') {
    XP.descargarFoto(reg);
  } else if (btn.dataset.accion === 'reenviar') {
    // Por si la fila se borró por error en la planilla: la marca como pendiente
    // para que el próximo "Sincronizar" la vuelva a enviar (no se duplica).
    if (!confirm('¿Marcar esta colecta para enviarla de nuevo en la próxima sincronización?')) return;
    reg.sincronizado = 0;
    reg.estado_sincronizacion = 'Pendiente';
    await DB.updateColecta(reg);
    await refrescarLista();
  } else if (btn.dataset.accion === 'borrar') {
    const aviso = reg.sincronizado
      ? 'Se borra solo de este celular: en la planilla y en Drive queda igual.'
      : 'Todavía NO está sincronizada: se perderá por completo.';
    if (!confirm(`¿Eliminar la colecta de ${reg.nombre_cientifico} del ${reg.fecha}?\n${aviso}`)) return;
    if (editando && editando.id === id) limpiar();
    await DB.deleteColecta(id);
    toast('Colecta eliminada');
    await refrescarLista();
  }
}

// ---------- Navegación y arranque ----------
function irA(vista) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === vista));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + vista));
  window.scrollTo({ top: 0 });
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => irA(tab.dataset.view)));
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

// ---------- Sincronización ----------
async function sincronizar() {
  const btn = $('btn-sync');
  const info = $('sync-info');
  const barra = $('sync-progreso');
  const listaFallidos = $('sync-fallidos');
  if (!navigator.onLine) { toast('Sin conexión: sincroniza cuando tengas señal', 4000); return; }
  btn.disabled = true;
  listaFallidos.classList.add('hidden');
  barra.classList.remove('hidden');
  try {
    const r = await SYNC.sincronizar(VERSION, (n, total) => {
      info.textContent = `Enviando colecta ${n} de ${total}…`;
      barra.firstElementChild.style.width = `${Math.round(((n - 1) / total) * 100)}%`;
    });
    barra.firstElementChild.style.width = '100%';
    if (!r.total) {
      info.textContent = 'No hay colectas pendientes. Todo está sincronizado.';
    } else {
      info.textContent = `Sincronizadas ${r.enviados} de ${r.total}.` +
        (r.fallidos.length ? ` Quedaron ${r.fallidos.length} pendientes: vuelve a sincronizar más tarde.` : ' ✅');
    }
    if (r.fallidos.length) {
      listaFallidos.innerHTML = r.fallidos.map((f) =>
        `<li>${esc(f.reg.fecha)} · <em>${esc(f.reg.nombre_cientifico)}</em>: ${esc(f.motivo)}</li>`).join('');
      listaFallidos.classList.remove('hidden');
    }
    toast(r.fallidos.length ? 'Sincronización incompleta' : 'Sincronización terminada');
  } catch (err) {
    info.textContent = err.message;
    toast(err.message, 4500);
  } finally {
    btn.disabled = false;
    setTimeout(() => barra.classList.add('hidden'), 1500);
    await refrescarLista();
  }
}

function setupSync() {
  $('lnk-planilla').href = SYNC.URL_DESCARGA_PLANILLA;
  $('btn-sync').addEventListener('click', sincronizar);
  $('sync-url').value = SYNC.getUrl();
  $('sync-url').addEventListener('change', (e) => { SYNC.setUrl(e.target.value); toast('Dirección guardada'); });
  $('sync-url-reset').addEventListener('click', () => { $('sync-url').value = SYNC.resetUrl(); toast('Dirección por defecto'); });
}

async function exportar(fn) {
  const regs = await DB.getColectas();
  if (!regs.length) { toast('No hay colectas para exportar'); return; }
  fn(regs);
}

function init() {
  llenarSelect(campo('faena'), FAENAS);
  llenarSelect(campo('habito'), HABITOS);
  llenarSelect(campo('estado_identificacion'), ESTADOS_IDENTIFICACION);
  llenarSelect(campo('momento_colecta'), MOMENTOS_COLECTA);
  llenarSelect(campo('semillas_de'), ORIGENES_SEMILLA);
  setupRecolector();
  setupEspecie();
  setupTerritorio();
  setupCuenca();
  toggleFaenaOtro = wireOtro('faena', () => campo('faena').value);
  campo('faena').addEventListener('change', toggleFaenaOtro);
  $('btn-cancelar-edicion').addEventListener('click', cancelarEdicion);
  // "Otro" en recolector y faena: se escribe solo en mayúsculas.
  form.querySelectorAll('input.mayusculas').forEach((el) => el.addEventListener('input', () => {
    const pos = el.selectionStart;
    el.value = el.value.toUpperCase();
    el.setSelectionRange(pos, pos);
  }));
  // Al corregir un campo marcado, se quita la marca roja.
  form.addEventListener('input', (e) => e.target.classList.remove('invalido'));
  form.addEventListener('change', (e) => e.target.classList.remove('invalido'));

  campo('cuenca_otro').addEventListener('change', reetiquetar);
  $('btn-punto').addEventListener('click', tomarPunto);
  $('f-foto').addEventListener('change', alElegirFoto);
  $('btn-quitar-foto').addEventListener('click', quitarFoto);
  $('btn-limpiar').addEventListener('click', () => {
    if (editando) { cancelarEdicion(); return; }
    if (confirm('¿Borrar todo lo escrito en el formulario?')) { olvidarSalida(); limpiar(); }
  });
  form.addEventListener('submit', guardar);
  $('lista').addEventListener('click', accionLista);
  $('btn-excel').addEventListener('click', () => exportar(XP.descargarExcel));
  $('btn-fotos').addEventListener('click', () => exportar(XP.descargarFotosZip));
  $('version').textContent = VERSION;

  setupTabs();
  setupNetwork();
  setupSync();
  limpiar();
  refrescarLista();
}

init();
