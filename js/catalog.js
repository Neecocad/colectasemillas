// Configuración del formulario y catálogos cortos de la ficha de colecta.
// Los catálogos largos (especies, cuencas, regiones/provincias/comunas) se generan
// desde las planillas de datos/ y viven en catalogos-datos.js.
export { ESPECIES, CUENCAS, TERRITORIO } from './catalogos-datos.js';
import { NOMINA } from './recolectores-datos.js';

export const PROYECTO = {
  nombre: 'Colecta de semillas',
  organizacion: 'Vivero Guayacanes',
};

// Valor que habilita el campo de texto libre en las listas que lo admiten.
export const OPCION_OTRO = 'Otro (especificar)';

// Personas recolectoras: nómina de Biocys (generada, ver recolectores-datos.js)
// + "Otro" para escribir un nombre que no esté (se guarda en mayúsculas).
export const RECOLECTORES = [...NOMINA, OPCION_OTRO];

// Faena: "Otro" se escribe a mano y se guarda en mayúsculas.
export const FAENAS = ['Santiago Solar', 'Vivero', 'Canalistas', 'Palqui', OPCION_OTRO];

export const HABITOS = ['Arbol', 'Arbusto', 'Cactus', 'Hierba', 'Trepadora'];
export const ESTADOS_IDENTIFICACION = ['Especie confirmada', 'Especie pendiente', 'Especie no identificada'];
export const MOMENTOS_COLECTA = ['Temprano', 'Óptimo', 'Tardío'];
export const ORIGENES_SEMILLA = ['Planta', 'Suelo', 'Ambas'];

// Columnas de la planilla, en el orden exacto de la ficha (con Nombre científico
// antes que Nombre común, según lo pedido). `campo` es la clave del registro.
export const COLUMNAS = [
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
];
