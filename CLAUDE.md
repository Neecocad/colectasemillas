# Contexto para Claude

## Cómo comunicarse en este proyecto

Quien mantiene este repositorio **no es programador de oficio** y quiere entender
lo que se construye. Explicar el **porqué** de cada decisión, traducir los
términos técnicos la primera vez (PWA, IndexedDB, service worker, rama, commit),
señalar las trampas y decir **qué mirar para comprobar que funciona**. Responder
en español.

## Qué es este proyecto

PWA offline para la **ficha de colecta de semillas** de Vivero Guayacanes. Una
colecta por registro, con punto GPS (UTM 19S) y foto etiquetada. Se usa en
terreno, sin señal, en celulares. Sigue la estructura de
`Neecocad/verano-energy-registros`.

## Reglas que no se deben romper

- **Todos los campos son obligatorios salvo Comentarios**: no se guarda nada incompleto.
- Los "Otro" de recolector y faena se guardan en **mayúsculas**.
- La nómina de Biocys **nunca** se sube al repo (datos personales): solo los
  nombres, vía `tools/generar_recolectores.py`.
- Fecha, recolector, faena, cuenca y territorio se reponen tras guardar **solo
  el mismo día** (localStorage con la fecha).
- **Orden de columnas** = el de `COLUMNAS` en `js/catalog.js` (Nombre científico
  antes que Nombre común).
- **Científico → común** siempre se autocompleta; **común → científico** solo si
  el nombre común es único (hay nombres comunes compartidos por varias especies).
- Listas encadenadas Región → Provincia → Comuna desde `datos/Regiones_provincias_comunas.xlsx`.
- La etiqueta de la foto va **dibujada sobre los píxeles** (Canvas), no en EXIF:
  «Colecta de semillas», fecha, coordenadas, cuenca, provincia y comuna (se
  re-dibuja al guardar).
- UTM con huso **19S fijo** (ver README).
- `js/catalogos-datos.js` es generado: se cambia la planilla en `datos/` y se
  corre `tools/generar_catalogos.py`, nunca se edita a mano.

## Al trabajar aquí

- Verificar en Chromium con Playwright (geolocalización simulada + foto de prueba).
- Al cambiar cualquier archivo cacheado, subir `CACHE` en `sw.js` y `VERSION` en
  `js/app.js`.
- Sincronización: `js/sync.js` envía **una colecta por llamada** (con foto) a
  `apps-script/Codigo.gs`; upsert por "ID colecta", foto idempotente por nombre,
  fotos en `BD_Colecta de semillas/Fotografías/AAAAMMDD_Faena` (fecha de colecta + faena).
- Cambiar `apps-script/Codigo.gs` no basta: hay que pegarlo en el editor de
  Google y publicar una **nueva versión** de la implementación existente
  (nunca una implementación nueva: cambia la URL). Recordarlo siempre.
- El script se probó con Sheets/Drive simulados en Node; Apps Script no corre
  localmente.
