# 🌱 Colecta de semillas — Vivero Guayacanes

Formulario web instalable en el celular (PWA) y **100 % offline** para registrar
cada colecta de semillas en terreno: especie, ubicación, punto GPS y una
fotografía del individuo con etiqueta.

Sigue la misma estructura que las apps de Verano Energy
([verano-energy-registros](https://github.com/Neecocad/verano-energy-registros)):
HTML + JavaScript sin dependencias, IndexedDB para guardar sin señal y un
service worker para funcionar offline.

Las colectas se guardan en el celular, sin necesidad de señal. Con el botón
**Sincronizar** se envían a la planilla **BD_Colectasemillas** de la unidad
compartida VIVERO 2026, y las fotos quedan en Drive ordenadas por fecha.

## Sincronización con Google Sheets

```
Celular ──▶ Apps Script (Web App /exec) ──▶ BD_Colectasemillas, hoja "Colectas"
                                         └─▶ BD_Colecta de semillas / Fotografías / AAAAMMDD_Faena /
```

- **Instalación del script:** [`apps-script/COMO-INSTALAR.md`](apps-script/COMO-INSTALAR.md).
- **Por partes:** se envía **una colecta por llamada**, con su foto. Mandarlo
  todo junto falla cuando hay muchas fotos, porque el paquete pesa decenas de MB
  y Apps Script corta por tiempo. Si una colecta falla (por señal débil o un
  corte), las demás siguen y la que falló queda *Pendiente* para el próximo
  intento.
- **Sin duplicados:** la fila se busca por "ID colecta" y la foto por su nombre
  dentro de su carpeta. Reenviar actualiza la fila existente en vez de crear
  otra.
- **Fotos por fecha y faena:** se guardan en `Fotografías/AAAAMMDD_Faena`, según
  la **fecha de la colecta** y su faena, por ejemplo `20261118_Santiago Solar`.
  La fecha va primero para que, al ordenar por nombre, las carpetas queden en
  orden cronológico. En la planilla, el nombre de la foto es
  un enlace al archivo.
- **Hoja "Colectas":** tiene las 18 columnas de la ficha y, al final, columnas
  de control: huso, latitud/longitud, precisión GPS, hora de la foto, fecha de
  registro y de sincronización, versión de la app e ID de la colecta.
- **Pestaña Sincronizar:** muestra la versión de la app, cuántas colectas están
  pendientes o sincronizadas, el botón para sincronizar y las descargas:
  - **Planilla completa (Google Sheets):** descarga en Excel todas las colectas
    de todos los equipos. Necesita internet y una cuenta con acceso a la unidad
    compartida.
  - **Colectas y fotos de este equipo:** Excel y .zip, funcionan sin internet.
- **Eliminar en el celular** no borra nada en la planilla ni en Drive. El botón
  **↻** de una colecta sincronizada la marca para enviarla de nuevo, por ejemplo
  si alguien borró su fila por error en la planilla.

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

Al tocar el campo, la lista se abre completa sin necesidad de escribir. Se
recorre deslizando el dedo hacia arriba o hacia abajo, y se elige tocando una
opción. Deslizar no elige nada: solo un toque completo selecciona.

### Fotografía

La etiqueta se dibuja **sobre la imagen** (no en los metadatos, que WhatsApp y
otras apps borran) e incluye:

```
Colecta de semillas
Fecha: 18-11-2026 14:32
UTM 19S: 346564 E · 6299025 N
Cuenca: Rio Maipo (057)
Provincia: Cordillera · Comuna: Pirque
```

Si la foto se toma antes de elegir cuenca, provincia o comuna, la etiqueta
muestra "—" en esos datos y se vuelve a dibujar sola cuando se completan, y
también al guardar. Las líneas muy largas, como algunos nombres de cuenca, se
cortan en dos.

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
index.html                · pantalla: Nueva colecta / Colectas / Sincronizar
css/styles.css            · estilos (colores del logo)
js/app.js                 · formulario, GPS, foto con etiqueta, validación, lista
js/combobox.js            · lista desplegable con búsqueda
js/catalog.js             · catálogos cortos y orden de columnas de la planilla
js/catalogos-datos.js     · GENERADO: especies, cuencas, regiones/provincias/comunas
js/recolectores-datos.js  · GENERADO: nombres de la nómina Biocys
js/db.js                  · IndexedDB (guardado en el celular)
js/utm.js                 · conversión GPS → UTM 19S
js/export.js              · Excel y .zip de fotos
js/sync.js                · envío al Apps Script, una colecta por llamada
apps-script/Codigo.gs     · script de Google (se pega en la planilla)
apps-script/COMO-INSTALAR.md · guía para publicarlo
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
5. **Descargas (pestaña Sincronizar):** descargar el Excel y el .zip y comprobar que el nombre de cada
   foto en la planilla coincide con un archivo del .zip.

## Próximos pasos

- Editar una colecta ya guardada (por ahora solo se puede eliminar y volver a
  registrar).
