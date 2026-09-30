# dsh-pptx-sidebar

[简体中文](README.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

Lee presentaciones `.pptx` / `.pptm` en la barra lateral de DSH — las
diapositivas **en orden de presentación**, con su texto, sus niveles de
viñetas, las notas del orador y las imágenes incrustadas.

> **Esta es una vista de lectura, no una reproducción de la diapositiva.** Sin
> posicionamiento absoluto, sin fuentes del tema, sin herencia de marcadores
> de posición, sin animaciones. El visor lo indica en su cabecera, porque una
> diferencia de maquetación que parece un error de renderizado es peor que una
> limitación etiquetada con claridad.

Es un consumidor de
[dsh-better-sidebar](https://www.npmjs.com/package/dsh-better-sidebar):
registra un previsualizador de archivos y se dibuja dentro del área de vista
previa de la tarjeta Side. Sin ese plugin, carga, avisa una sola vez y no hace
nada.

---

## Instalación

```bash
dsh plugin --profile <profile> add github:drscrewdriver/dsh-pptx-sidebar#<sha>
dsh plugin --profile <profile> add dsh-pptx-sidebar@0.1.0     # once published
```

Luego **reinicia el host de DSH** — refrescar el navegador no basta para que
aparezca una nueva fila del cargador. Verificación sin arrancar nada:

```bash
dsh --profile <profile> --dump-config | Select-String dsh-pptx-sidebar
```

La instalación manual son tres pasos, no uno — ver `cordis.patch.yml`. Hacer
solo los pasos 1 y 3 produce un perfil donde el paquete está presente, la fila
del parche está presente, **y no carga nada, en silencio**.

## Qué hace / qué no hace

| Hecho | No hecho |
|-------|----------|
| Lista de diapositivas en el orden de `p:sldIdLst` | Maquetación visual, posicionamiento absoluto |
| Párrafos de texto, nivel de viñeta por párrafo | Resolución de fuentes del tema/patrón |
| Detección del título por el tipo de marcador de posición | **Herencia de marcadores de posición** (ver abajo) |
| Notas del orador desde las partes `notesSlide` | Gráficos re-renderizados como gráficos |
| Imágenes incrustadas como blob URL | Animación, transiciones, temporizaciones |
| Tablas reales (`a:tbl`) | Comentarios, marcas de revisión |
| Runs en negrita / cursiva | Edición, escritura de vuelta |
| Siete topes del disyuntor | `.ppt` legado (BIFF/OLE2), formatos WPS |

### La línea de la herencia de marcadores de posición (deliberada)

Una diapositiva a menudo muestra texto que no contiene: números, pies de
página y texto del título que viven en `slideLayout` / `slideMaster`,
referenciados mediante un marcador de posición `p:ph`. Resolverlos implicaría
reimplementar la cadena de herencia de PowerPoint — incluidos los overrides
de nivel de `lstStyle` y qué diseño usa realmente la diapositiva.

**La v1 no lo hace.** Solo se lee la parte propia de la diapositiva. La
consecuencia se declara en lugar de ocultarse: una diapositiva cuyo texto es
enteramente heredado se muestra sin texto. Es una omisión visible, no una
corrupción — el compromiso contrario (heredar incorrectamente) mostraría
texto que no está en la diapositiva.

## Adaptación al ancho

El panel de la barra lateral es redimensionable, así que la vista de lectura
se adapta a él — dentro de unos límites, porque «adaptativo» no es una
licencia para seguir creciendo o encogiendo sin fin:

| Ajuste | Valor | Por qué |
|--------|-------|---------|
| Ancho base | 360 px | El factor aquí es **exactamente 1**, así que el ancho habitual del panel muestra la maquetación tal como la envió la 0.1.0 |
| Mínimo | 0.9× | Un panel estrecho sigue teniendo tipografía legible |
| Máximo | 1.15× | Un panel ancho recibe tipografía cómoda, no enorme |
| Cuantización | 2 decimales | Arrastrar reorganiza la maquetación en pasos de 0.01, no en cada píxel |

El factor se deriva del ancho del panel y se escribe en la propiedad
personalizada `--reader-scale`; el tamaño de fuente raíz pasa a ser
`13px × scale` y el contenido de la diapositiva se expresa en `em`, de modo
que el texto **refluye** al nuevo tamaño en lugar de escalarse con una
transformación (lo que desenfocaría los glifos).

**Solo se escala el documento.** Títulos, viñetas, párrafos, notas, tablas y
leyendas siguen el factor; la tira de cabecera, la tira de diapositivas, el
banner del disyuntor y los estados de carga/vacío mantienen su tamaño fijo.
Un entorno que cambia de tamaño mientras arrastras un divisor se lee como un
fallo, no como capacidad de respuesta.

Dos decisiones relacionadas:

- **Un ancho no medible retrocede a 1**, no a un límite. Antes de la primera
  medición el ancho es 0, y mostrarlo como «lo más estrecho posible» haría
  parpadear una tipografía minúscula cada vez que se abre una presentación.
- **Las imágenes no se escalan.** Se muestran con el tamaño que indica la
  transformación de la forma y solo las limita el panel; ampliar un mapa de
  bits más allá de su tamaño natural para seguir al texto lo volvería más
  borroso, no más fiel.

## El pipeline

```
archive bytes (host /sidebar/file, custom loader)
  → archive-size gate                      refuse before any unpacking
  → central directory (declared-size gate) refuse a lying part before inflating
  → streaming inflate + total budget       the zip-bomb gate
  → ppt/presentation.xml                   p:sldIdLst — slide ORDER
  → ppt/_rels/presentation.xml.rels        rId → slides/slideN.xml
  → ppt/slides/slideN.xml                  p:spTree → p:sp / p:pic / p:graphicFrame
  │     p:txBody → a:p → a:pPr@lvl (level), a:r → a:rPr(b/i) + a:t
  │     p:pic    → a:blip@r:embed → slide rels → ppt/media/*
  │     p:grpSp  → recursed, never flattened away
  ├→ ppt/slides/_rels/slideN.xml.rels      .../notesSlide → notesSlides/notesSlideN.xml
  └→ rules: a slide too long loses only its own tail; notes absent is silence
```

Las imágenes se extraen del zip y se convierten en object URL. Una imagen
incrustada vive *dentro* del archivo, así que no existe una ruta del host a la
que apuntar — no es «leer archivos por nuestra cuenta», es usar los bytes que
el host ya entregó.

## Los siete topes del disyuntor

| Dimensión | Predeterminado | Por encima |
|-----------|----------------|------------|
| Tamaño del archivo | 8 MB | BLOQUEADO — rechazado antes de desempaquetar nada |
| Inflado total | 64 MB | BLOQUEADO — la barrera contra zip-bomb |
| Una parte | 32 MB | BLOQUEADO — una sola parte XML sobredimensionada |
| Diapositivas | 300 | TRUNCADO — el lector deja de recorrer la presentación |
| Texto de la diapositiva | 20 000 caracteres | el resto del texto de esa diapositiva se omite |
| Imágenes | 200 | las imágenes siguientes se saltan |
| Una imagen | 8 MB | esa imagen se salta (ni siquiera se descomprime) |

**Como máximo un aviso por dimensión**, estructuralmente — los avisos viven
en un `Map<reason, warning>`, de modo que una dimensión que salta en cada
diapositiva produce una línea, no sesenta.

El tope de texto por diapositiva omite solo la diapositiva culpable. Un tope
por bloque recortaría todas las diapositivas por igual y perdería información
para la que la presentación tenía presupuesto; el modo de fallo que aceptamos
en su lugar es «la diapositiva 12 queda a medias».

## Pruebas

```bash
npm install
npm run verify          # build (bundle load gate) + tests
npm test                # 19 checks
```

El fixture es un zip real con forma de pptx construido en el propio archivo
de pruebas, con un pequeño PNG genuino. Es hostil exactamente donde lo es el
formato:

- `p:sldIdLst` lista la **diapositiva 2 antes de la 1**, de modo que ordenar
  las partes por nombre de archivo pasaría todas las demás aserciones y
  seguiría siendo incorrecto;
- una relación de diapositiva usa un destino **absoluto**, otra es
  **External**;
- `ppt/slideLayouts/slideLayout1.xml` contiene `MASTER TEXT MUST NOT APPEAR`,
  que nunca debe asomar — eso es lo que significa aquí «sin herencia de
  marcadores de posición».

## Estructura

| Archivo | Rol |
|---------|-----|
| `pptx.ts` | El lector: partes, relaciones, árbol de formas, notas, imágenes |
| `circuit-breaker.ts` | Los siete topes y la regla de un aviso por dimensión |
| `zip.ts` / `xml.ts` | Lectura del contenedor; escaneo XML dirigido con conteo de profundidad |
| `PptxViewer.tsx` | Tira de diapositivas, renderizado de la diapositiva actual, ciclo de vida de los object URL |
| `locales.ts` | Diccionarios zh / en, incluida cada plantilla de aviso |
| `seams.ts` | Espejos estructurales de los servicios del cliente que consumimos |

El código de zip y XML está **copiado** del plugin de documentos hermano en
lugar de compartirse. Dos usuarios de este código aún no alcanzan el umbral
para extraer un paquete — eso añadiría una tercera cosa que publicar y fijar
por versión.

## Compatibilidad

| Versión del plugin | Rango de host DSH | Notas |
|--------------------|-------------------|-------|
| 0.3.0 | `>=0.2.0-rc.1 <0.2.1-0` | La línea 0.2.0 (`main`, promovida desde `compat/0.2.0`). Adaptación solo de metadatos: la superficie de consumo son llamadas puras `ctx.get(...)`, y 0.2.0-rc.1 mantiene intacta la API de plugins de 0.1.7 |
| 0.2.0 | `>=0.1.5-rc.1 <0.2.0-0` | Atendida por las ramas congeladas `compat/0.1.7` / `compat/0.1.5` |

`engines.dsh`, la dependencia par `@deepseek-ai/dsh-client-locale` de `package.json` y
`engines.dsh` de `dsh.plugin.json` llevan el mismo rango (mantenido en sintonía).

## Languages / Sprachen / Langues / Языки / Idiomas / Lingue

Este README está escrito en español. Referencia rápida de compatibilidad e instalación (esta línea requiere DSH 0.2.0: `>=0.2.0-rc.1 <0.2.1-0`; instalación: `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`):

- **Deutsch** — benötigt DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`). Installation: `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`. Die 0.1.x-Wirtslinie wird von den eingefrorenen Zweigen `compat/0.1.7` / `compat/0.1.5` (npm-Tags `dsh-0.1.7` / `dsh-0.1.5`) versorgt.
- **Français** — nécessite DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`). Installation : `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`. La lignée d'hôtes 0.1.x est assurée par les branches figées `compat/0.1.7` / `compat/0.1.5` (tags npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Русский** — требуется DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`). Установка: `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`. Линия хостов 0.1.x обслуживается замороженными ветками `compat/0.1.7` / `compat/0.1.5` (npm-теги `dsh-0.1.7` / `dsh-0.1.5`).
- **Español** — requiere DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`). Instalación: `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`. La línea de anfitriones 0.1.x la atienden las ramas congeladas `compat/0.1.7` / `compat/0.1.5` (etiquetas npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Italiano** — richiede DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`). Installazione: `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`. La linea di host 0.1.x è servita dai rami congelati `compat/0.1.7` / `compat/0.1.5` (tag npm `dsh-0.1.7` / `dsh-0.1.5`).

## Licencia

MIT
