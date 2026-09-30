# Registro de cambios

Todos los cambios notables de este proyecto se documentan aquí. El formato se
basa en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) y este
proyecto se adhiere al
[Versionado Semántico](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-09-29

### Cambiado

- **Línea de host redestinada a DSH 0.2.0** (`main`, promovida desde `compat/0.2.0`): `engines.dsh` y la
  dependencia par `@deepseek-ai/dsh-client-locale` pasan de `>=0.1.5-rc.1 <0.2.0-0` a
  `>=0.2.0-rc.1 <0.2.1-0` (fijación a la ventana rc; 0.2.1+ requerirá reevaluación). Adaptación solo de
  metadatos — la superficie de consumo del plugin son llamadas puras `ctx.get(...)` con definiciones de
  interfaces locales, y 0.2.0-rc.1 mantiene intacta la API de plugins de 0.1.7, por lo que hay cero cambios
  de código. Las líneas 0.1.x (0.1.5 / 0.1.7) siguen siendo atendidas por las ramas congeladas
  `compat/0.1.7` / `compat/0.1.5` (≤0.2.0).
- Árbol de dependencias actualizado a la nueva línea; lockfile regenerado. `dsh.plugin.json`
  version/engines sincronizados con `package.json`.

### Documentación (2026-09-29 — sin republicación)

- Reestructuración de ramas: `main` es ahora la línea 0.2.0 (promovida desde `compat/0.2.0`); las líneas
  de host 0.1.x son atendidas por las ramas congeladas `compat/0.1.7` / `compat/0.1.5`.
  Mapeo npm sin cambios: `dsh-0.2.0` → esta línea, `dsh-0.1.7` / `dsh-0.1.5` → la línea 0.1.x.
- Instalación (esta línea): `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`.
- La README incorporó una referencia rápida en cinco idiomas (Deutsch / Français / Русский / Español / Italiano).

## [0.2.0] — 2026-09-23

Adaptación al ancho: la vista de lectura se escala con el panel de la barra
lateral, dentro de unos límites.

### Añadido

- **Escala adaptativa al ancho** (`src/client/scale.ts` + `useReaderScale.ts`):
  un factor derivado del ancho se escribe en la propiedad personalizada
  `--reader-scale`, el tamaño de fuente raíz pasa a ser `13px × scale` y el
  contenido de la diapositiva se expresa en `em` para seguirlo. En el ancho
  base de **360 px el factor es exactamente 1**, así que la maquetación no
  cambia con el ancho habitual del panel; el mínimo es **0.9** y el máximo
  **1.15**.
- **Solo se escala el documento.** Títulos, viñetas, párrafos, notas, tablas
  y leyendas de imágenes siguen el factor; la tira de cabecera, la tira de
  diapositivas, el banner del disyuntor y los estados de carga/vacío
  conservan su tamaño fijo. Un entorno que se redimensiona mientras arrastras
  un divisor se lee como un fallo, no como capacidad de respuesta.
- **Cuantizado a dos decimales**, de modo que arrastrar un divisor reorganiza
  la maquetación en pasos de 0.01 y no en cada píxel.
- **Los anchos no medibles retroceden a 1** — 0, negativo, NaN o Infinity
  (primer fotograma, informe defectuoso) muestran la maquetación enviada en
  lugar de un extremo del rango, que haría parpadear una tipografía minúscula
  al abrir.
- **Sangría de viñetas en `em`** (`INDENT_EM = 1.08em`), que son los 14 px de
  antes a escala 1.
- **Tope de celda de tabla 320 px → 24.6em**, para que las celdas se
  estrechen con el panel en lugar de forzar una barra de desplazamiento
  horizontal.

### Cambiado

- Las imágenes siguen mostrándose con el tamaño que indica la transformación
  de la forma, limitadas solo por el panel: ampliar un mapa de bits más allá
  de su tamaño natural para seguir la escala del texto lo volvería más
  borroso, no más fiel.

### Pruebas

- 5 comprobaciones nuevas (24 en total), que cubren: el factor exactamente 1
  en el ancho base, ambos límites, la monotonía, el retroceso con anchos no
  medibles, la cuantización a dos decimales y la sangría correspondiente a
  14 px a escala 1.

### Empaquetado

- **Primera publicación en npm**: `dsh-pptx-sidebar@0.2.0`, dist-tags
  `latest` + `dsh-0.1.5`; 39 archivos / 83.1 kB, shasum del tarball
  `e6faf24a4e1c8e32a561ecb8693c828759626e96`.
- El paquete publicado declara **`repository`**, que apunta de vuelta a
  `drscrewdriver/dsh-pptx-sidebar`. La awesome list solo enlaza un paquete
  npm con un repositorio cuando el paquete publicado apunta a él.

## [0.1.0] — 2026-09-22

Primera versión. Lee `.pptx` / `.pptm` como una vista de lectura estructurada
en la barra lateral derecha de DSH.

### Añadido

- Registro de previsualizador de archivos para `.pptx` y `.pptm`
  (`priority: 50`, `fetchStrategy: 'custom'`), trayendo los bytes a través de
  la ruta `/sidebar/file` de better-sidebar, de modo que la valla de rutas
  del espacio de trabajo se queda del lado del host.
- Lista de diapositivas cuyo orden viene **únicamente** de `p:sldIdLst`
  resuelto mediante las relaciones de la presentación — nunca de ordenar los
  nombres de archivo de las partes. Los destinos de relación absolutos y
  relativos con `../` se resuelven ambos; los destinos External se ignoran.
- Recorrido del árbol de formas (`p:sp`, `p:pic`, `p:graphicFrame`,
  `p:grpSp`) con un único contador de profundidad, de modo que las formas
  agrupadas aportan su texto exactamente una vez.
- Extracción de texto con niveles de viñeta por párrafo (`a:pPr@lvl`, de
  0-based → 1-based) y runs en negrita / cursiva.
- Detección del título por el **tipo** de marcador de posición (`title` /
  `ctrTitle`), no por la posición ni el tamaño de fuente.
- Notas del orador desde las partes `notesSlide`, saltándose el marcador de
  posición de la imagen de la diapositiva. Una diapositiva sin notas no
  produce bloque, ni aviso, ni error.
- Imágenes incrustadas: `a:blip@r:embed` → relación → bytes del archivo →
  blob URL, con dimensionado EMU→px. Los formatos no renderizables (EMF/WMF)
  se convierten en marcadores de posición etiquetados en lugar de huecos
  silenciosos.
- Tablas reales a partir de graphic frames `a:tbl`.
- Siete topes del disyuntor (archivo / inflado total / parte única /
  diapositivas / texto de diapositiva / imágenes / imagen única), con **un
  aviso por dimensión**.
- Diccionarios zh y en, incluida una plantilla para cada motivo del
  disyuntor.
- Build con una barrera de carga real: el bundle del cliente se evalúa en una
  sandbox `node:vm` y se verifica que el export de la factory lleve `apply` e
  `inject`.
- `npm test` — 19 comprobaciones contra un fixture hostil construido en el
  propio proceso.
- Scripts de publicación y de migración de perfil (`-DryRun` por defecto),
  incluido un preflight que rechaza una spec que aún no se resuelve.

### Deliberadamente no incluido

- Herencia de marcadores de posición desde layouts y masters: la v1 lee solo
  la parte propia de la diapositiva. El razonamiento está en la sección del
  README del mismo nombre.
- Fidelidad de la maquetación visual, fuentes del tema, animación, edición,
  soporte de `.ppt`.
