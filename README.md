# 🌱 Colecta de semillas — Vivero Guayacanes

Formulario web instalable en el celular (PWA) y **100 % offline** para registrar
cada colecta de semillas en terreno: especie, ubicación, punto GPS y una
fotografía del individuo con etiqueta.

Sigue la misma estructura que las apps de Verano Energy
([verano-energy-registros](https://github.com/Neecocad/verano-energy-registros)):
HTML + JavaScript sin dependencias, IndexedDB para guardar sin señal y un
service worker para funcionar offline.

> **Etapa actual:** solo el formulario. Las colectas quedan en el celular y se
> descargan desde la pestaña **Exportar** (Excel + fotos en .zip). La conexión con
> Google Drive / Google Sheets es la etapa siguiente.

## Campos (en el orden de la planilla)

| # | Columna | Cómo se llena |
|---|---|---|
| 1 | Fecha colecta | Calendario (por defecto hoy; no acepta fechas futuras) |
| 2 | Nombre de recolector | Lista con búsqueda (nómina Biocys) + "Otro (especificar)" con texto libre **en mayúsculas** |
| 3 | Faena (en caso que corresponda) | Santiago Solar / Vivero / Canalistas / Palqui / Otro (texto, **solo mayúsculas**) |
| 4 | Nombre científico | Lista con búsqueda (407 especies). Al elegirlo, completa el nombre común |
| 5 | Nombre común | Lista con búsqueda. Al elegirlo, completa el científico (ver abajo) |
| 6 | Hábito de crecimiento | Arbol / Arbusto / Cactus / Hierba / Trepadora |
| 7 | Estado identificación | Especie confirmada / pendiente / no identificada |
| 8 | Momento de colecta | Temprano / Óptimo / Tardío |
| 9 | Fotografía del individuo | Cámara o galería; se etiqueta sola. En la planilla va el nombre del archivo |
| 10 | Cuenca | Lista con búsqueda (30 cuencas) + "Otro (especificar)" con texto libre |
| 11–13 | Región / Provincia / Comuna | Listas encadenadas: cada una muestra solo lo que corresponde a la anterior |
| 14–15 | Coordenada Este / Norte | Botón **📍 Tomar punto de la muestra** (UTM 19S, WGS84) |
| 16 | Semillas colectadas de | Planta / Suelo / Ambas |
| 17 | Cantidad colectada (gramos) | Número mayor que 0 |
| 18 | Comentarios | Texto (**opcional**) |

**Todos los campos son obligatorios, salvo Comentarios**: si falta alguno, el
formulario no guarda, marca en rojo lo que falta y muestra la lista arriba del
botón Guardar.

### Datos que se repiten en la misma salida

Al guardar una colecta, la app recuerda fecha, recolector, faena, cuenca y
región/provincia/comuna, y los deja puestos para la siguiente colecta **solo si
es el mismo día** (también si se cierra y se vuelve a abrir la app ese día). Al
día siguiente el formulario parte en blanco. El botón **Limpiar** borra todo,
incluidos esos datos recordados.

### Nombre científico ↔ nombre común

Cada nombre científico tiene un solo nombre común, pero un nombre común puede
corresponder a varias especies (por ejemplo, "Cactus" corresponde a 18 y
"Añañuca" a 4). Por eso:

- Al elegir el **científico**, el común se completa siempre
  (*Sophora macrocarpa* → Mayu).
- Al elegir el **común**, si hay una sola especie, el científico se completa solo
  (Mayu → *Sophora macrocarpa*). Si hay varias, la lista de científicos se reduce
  a esas y se pide elegir una.

En las listas con búsqueda se escribe y se va filtrando. No importan las
mayúsculas ni las tildes, y se busca en cualquier parte del texto ("macro"
encuentra *Sophora macrocarpa*). Solo se aceptan valores de la lista: si se
escribe algo que no está, el campo se vacía al salir.

### Fotografía

La etiqueta se dibuja **sobre la imagen** (no en los metadatos, que WhatsApp y
otras apps borran) e incluye:

```
Colecta de semillas
Fecha: 18-11-2026 14:32
UTM 19S: 346564 E · 6299025 N
```

Si se adjunta la foto antes de tomar el punto, la app toma el punto
automáticamente. Si se vuelve a tomar el punto después, la foto se vuelve a
etiquetar con las coordenadas nuevas.

### Por qué UTM huso 19 Sur fijo

El límite entre los husos 18 y 19 (meridiano 72° O) pasa por la costa de
Valparaíso y O'Higgins. Con el huso calculado automáticamente, dos colectas a
pocos kilómetros podrían quedar en husos distintos, y como la planilla solo tiene
columnas Este y Norte (sin huso), no serían comparables. Por eso todas se
expresan en 19S.

## Estructura

```
index.html                · pantalla: Nueva colecta / Colectas / Exportar
css/styles.css            · estilos (colores del logo)
js/app.js                 · formulario, GPS, foto con etiqueta, validación, lista
js/combobox.js            · lista desplegable con búsqueda
js/catalog.js             · catálogos cortos y orden de columnas de la planilla
js/catalogos-datos.js     · GENERADO: especies, cuencas, regiones/provincias/comunas
js/recolectores-datos.js  · GENERADO: nombres de la nómina Biocys
js/db.js                  · IndexedDB (guardado en el celular)
js/utm.js                 · conversión GPS → UTM 19S
js/export.js              · Excel y .zip de fotos
js/xlsx-mini.js           · generador de Excel sin internet (de verano-energy-registros)
sw.js                     · service worker (funcionamiento offline)
manifest.webmanifest      · datos para instalar la app
icons/                    · logo Vivero Guayacanes e íconos
datos/                    · planillas fuente de las listas
tools/generar_catalogos.py · regenera js/catalogos-datos.js desde datos/
tools/generar_recolectores.py · regenera js/recolectores-datos.js desde la nómina
```

## Cambiar las listas

- **Especies, cuencas, regiones/provincias/comunas:** reemplazar la planilla en
  `datos/` (mismo nombre y mismas columnas) y correr
  `python3 tools/generar_catalogos.py` (necesita `pip install openpyxl`).
- **Recolectores:** se generan desde la nómina mensual de Biocys con
  `python3 tools/generar_recolectores.py "ruta/a/la/nomina.xlsx"`. La nómina
  **no se guarda en el repositorio** porque trae RUT, fechas de nacimiento,
  direcciones y correos; el script toma solo la columna de nombres. Los nombres
  quedan como en la nómina (apellidos primero), y la búsqueda encuentra
  cualquier parte del nombre.
- **Faenas y demás listas cortas:** editar `js/catalog.js`.
- Después de cualquier cambio, subir `CACHE` en `sw.js` y `VERSION` en
  `js/app.js`. Si no, los celulares que ya tienen la app instalada pueden seguir
  mostrando la versión anterior.

## Publicar (GitHub Pages)

1. En GitHub: **Settings → Pages → Source: Deploy from a branch**, rama `main`,
   carpeta `/ (root)`.
2. La app queda en `https://neecocad.github.io/colectasemillas/`. Se necesita
   HTTPS para que funcionen el GPS, la cámara y la instalación.
3. En el celular, abrir esa dirección y usar **Agregar a pantalla de inicio**.

## Probar antes de salir a terreno

1. **Sin señal:** con la app ya abierta una vez, activar el modo avión y guardar
   una colecta completa con punto y foto.
2. **Obligatorios:** tocar Guardar con el formulario vacío. Debe listar todos
   los campos que faltan y no guardar.
3. **Especie:** elegir *Sophora macrocarpa* → debe aparecer Mayu. Elegir
   "Añañuca" en común → la lista de científicos debe mostrar solo 4.
4. **Territorio:** Región Metropolitana → provincias: Chacabuco, Cordillera,
   Maipo, Melipilla, Santiago, Talagante. Cordillera → comunas: Pirque,
   Puente Alto, San José de Maipo.
5. **Exportar:** descargar el Excel y el .zip y comprobar que el nombre de cada
   foto en la planilla coincide con un archivo del .zip.

## Próximos pasos

- Sincronización con Google Sheets + subida de fotos a Google Drive (backend
  Apps Script, como en Verano Energy).
- Editar una colecta ya guardada (por ahora solo se puede eliminar y volver a
  registrar).
