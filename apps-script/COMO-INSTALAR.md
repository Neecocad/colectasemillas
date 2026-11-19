# Cómo instalar el script de sincronización (paso a paso)

Guía para conectar la app con la planilla **BD_Colectasemillas**. Toma unos
10 minutos. Conviene hacerla en un computador, con esta guía al lado.

## Antes de empezar: qué vas a hacer y por qué

La app del celular no puede escribir directamente en Google Sheets. Necesita un
intermediario: un **Apps Script**, que es un programa pequeño que vive dentro de
la planilla. Al publicarlo como **aplicación web** (Google lo llama
*implementación* o *deployment*), Google le da una dirección que termina en
`/exec`. La app envía cada colecta a esa dirección y el script la escribe en la
planilla y guarda la foto en Drive.

```
Celular ──▶ https://script.google.com/…/exec ──▶ BD_Colectasemillas (hoja "Colectas")
                                              └─▶ BD_Colecta de semillas / Fotografías / AAAAMMDD_Faena_Recolector /
```

Hay **dos copias** del script, y no están conectadas entre sí:

- `apps-script/Codigo.gs` en GitHub: es el original, con historial de cambios.
- El editor de Apps Script en Google: es lo que realmente se ejecuta.

Cuando el archivo cambie en GitHub, hay que copiarlo a mano al editor (ver el
paso 6).

## ⚠️ Requisito: la cuenta que instala

El script se ejecuta **con la cuenta de quien lo publica** ("Ejecutar como: Yo").
Esa cuenta debe poder **editar** en la unidad compartida *VIVERO 2026*, con rol
de Gestor de contenido o de Colaborador. Si solo tiene permiso de lectura, la
sincronización fallará con un error de permisos.

Usa una cuenta institucional que no vaya a desaparecer, por ejemplo la del
vivero. Si la cuenta que publicó el script se elimina, la sincronización deja de
funcionar.

## Los pasos

### 1. Abrir el editor de Apps Script

Abre la planilla **BD_Colectasemillas** (VIVERO 2026 → BD_Colecta de semillas) y
entra al menú **Extensiones → Apps Script**. Se abre el editor en otra pestaña.

### 2. Pegar el script

1. En GitHub, abre `apps-script/Codigo.gs` y presiona el botón **copiar** (el
   ícono de dos hojitas, arriba a la derecha del archivo).
2. En el editor, selecciona todo lo que haya (Ctrl+A / Cmd+A) y pega encima.
3. Guarda con **Ctrl+S** (Cmd+S). Opcional: arriba a la izquierda, renombra el
   proyecto como "Sincronización colectas".

Ya trae configurados los identificadores de la planilla y de la carpeta, así
que no hay que cambiar nada.

### 3. Publicar (solo la primera vez)

**Implementar → Nueva implementación** → en el engranaje ⚙️ elige
**Aplicación web**:

- Descripción: `v1`
- Ejecutar como: **Yo**
- Quién tiene acceso: **Cualquier persona**

Presiona **Implementar**.

> **¿"Cualquier persona" es seguro?** Significa que la app puede enviar datos sin
> que cada recolector inicie sesión en Google. Solo quien conozca la dirección
> `/exec` puede enviar datos, y el script solo acepta colectas. **No** da acceso
> a la planilla ni a las fotos: esas siguen protegidas por los permisos de la
> unidad compartida.

### 4. Autorizar

La primera vez, Google pide permisos: **Autorizar acceso** → elige tu cuenta.
Si aparece "Google no verificó esta app", presiona **Configuración avanzada →
Ir a Sincronización colectas (no seguro) → Permitir**. Ese aviso es normal para
un script propio que no se ha publicado en la tienda de Google. Los permisos que
pide son para tu planilla y tu Drive.

### 5. Copiar la dirección y probarla

1. Copia la **URL de la aplicación web** (termina en `/exec`).
2. Ábrela en el navegador. Debe responder algo así:

   ```json
   {"status":"ok","mensaje":"Colecta de semillas – Vivero Guayacanes – API activa",
    "planilla":"BD_Colectasemillas","carpeta":"BD_Colecta de semillas", ...}
   ```

   Si dice `"status":"error"`, el mensaje explica qué falta. Lo más común es que
   la cuenta no tenga acceso a la planilla o a la carpeta.
3. Pásale esa URL a quien mantiene el repositorio, para dejarla fija en la app
   (`DEFAULT_URL` en `js/sync.js`). Mientras tanto, se puede pegar en el celular:
   pestaña **Sincronizar → Configuración**.

### 6. Cuando el script cambie (actualizaciones)

**No** crees una implementación nueva, porque eso cambia la URL y los celulares
seguirían enviando a la antigua. En su lugar:

1. Pega el archivo nuevo en el editor (paso 2) y guarda.
2. **Implementar → Administrar implementaciones → editar (✏️) → Versión: Nueva
   versión → Implementar**.

Así la URL `/exec` se mantiene y no hay que tocar nada en los celulares.

## Comprobar que todo funciona

1. En un celular, guarda una colecta de prueba y presiona **Sincronizar**.
2. En la planilla debe aparecer la hoja **Colectas**, con una fila. La celda de
   fotografía debe ser un enlace a la foto.
3. En Drive: **BD_Colecta de semillas → Fotografías → AAAAMMDD_Faena_Recolector** (la fecha,
   la faena y el recolector de la colecta) debe contener la foto con su etiqueta.
4. Vuelve a enviar la misma colecta (en la lista, botón ↻ y después
   Sincronizar). La fila debe actualizarse **sin duplicarse**, y la foto
   tampoco debe duplicarse.
5. Borra después la fila y la foto de prueba.
