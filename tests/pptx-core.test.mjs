/**
 * Core tests for the .pptx reader + circuit breaker.
 *
 * The fixture is a **real pptx-shaped zip built here**: deflate entries with
 * proper CRC32s and a correct central directory, referencing a genuine (if tiny)
 * PNG. That exercises the paths a synthetic object graph cannot — slide order
 * through `p:sldIdLst`, relationship resolution with `../` targets, EMU→px
 * conversion, the unsupported-format placeholder.
 *
 * Two fixtures are deliberately hostile where the real format is:
 *
 * - the deck's `p:sldIdLst` is **out of filename order** (`slide2` first), so a
 *   reader sorting part names would pass every other assertion and still be
 *   wrong;
 * - `ppt/slideLayouts/slideLayout1.xml` carries text that must NOT appear, which
 *   is what "we do not do placeholder inheritance" means in practice.
 *
 * Run: `npm test`  (exits non-zero on any failed assertion)
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = mkdtempSync(join(tmpdir(), 'dsh-pptx-test-'))

await build({
  absWorkingDir: root,
  entryPoints: ['src/client/pptx.ts', 'src/client/locales.ts', 'src/client/scale.ts'],
  outdir: outDir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'warning',
})

const pptx = await import(pathToFileURL(join(outDir, 'pptx.mjs')).href)
const { dictionaries, interpolate } = await import(pathToFileURL(join(outDir, 'locales.mjs')).href)
const scale = await import(pathToFileURL(join(outDir, 'scale.mjs')).href)

// ── a minimal, correct zip writer (fixture only) ─────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

/** Standard CRC32, as the central directory records it. */
function crc32(buffer) {
  let c = -1
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/**
 * Build a zip from `{ name, data, declaredSize? }` entries. `declaredSize`
 * overrides the central directory's uncompressed size — the lying-header case the
 * declared-size gate must catch without inflating.
 */
function zip(entries) {
  const locals = []
  const central = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8')
    const payload = deflateRawSync(raw)
    const crc = crc32(raw)
    const declared = entry.declaredSize ?? raw.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(declared, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, payload)

    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(8, 10)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(payload.length, 20)
    cen.writeUInt32LE(declared, 24)
    cen.writeUInt16LE(name.length, 28)
    cen.writeUInt32LE(offset, 42)
    central.push(cen, name)

    offset += local.length + name.length + payload.length
  }

  const directory = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(directory.length, 12)
  eocd.writeUInt32LE(offset, 16)

  return new Uint8Array(Buffer.concat([...locals, directory, eocd]))
}

// ── the fixture deck ─────────────────────────────────────────────────────────

/** A real 1×1 PNG, so the image path carries actual bytes with a real signature. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+2gAAAABJRU5ErkJggg==',
  'base64',
)

const NS_DECLS = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`

const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const REL_SLIDE_PER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const TYPE_SLIDE = `${REL_SLIDE_PER}/slide`
const TYPE_NOTES = `${REL_SLIDE_PER}/notesSlide`
const TYPE_MASTER = `${REL_SLIDE_PER}/slideMaster`
const TYPE_IMAGE = `${REL_SLIDE_PER}/image`

/**
 * The presentation, with `p:sldIdLst` deliberately **not** in filename order:
 * `rId8` (slide2.xml) shows first. `rId8`'s target is written as an absolute
 * path so the two resolution styles are both covered.
 */
const PRESENTATION = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS_DECLS}>
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId8"/>
    <p:sldId id="257" r:id="rId6"/>
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`

const PRESENTATION_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELATIONSHIP_NS}">
  <Relationship Id="rId1" Type="${TYPE_MASTER}" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId6" Type="${TYPE_SLIDE}" Target="slides/slide1.xml"/>
  <Relationship Id="rId8" Type="${TYPE_SLIDE}" Target="/ppt/slides/slide2.xml"/>
</Relationships>`

/** Slide 1: a title, three bullets, a bold+italic run, a group, two pictures and a table. */
const SLIDE_1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS_DECLS}>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title" idx="0"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:bodyPr/><a:lstStyle/>
          <a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>Quarterly report</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="838200" y="1825625"/><a:ext cx="10515600" cy="4351338"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:bodyPr/><a:lstStyle/>
          <a:p><a:pPr lvl="0"><a:buChar char="•"/></a:pPr><a:r><a:t>Top bullet</a:t></a:r></a:p>
          <a:p><a:pPr lvl="1"><a:buChar char="•"/></a:pPr><a:r><a:t>Nested bullet</a:t></a:r></a:p>
          <a:p><a:pPr lvl="2"/><a:r><a:t>Indented without marker</a:t></a:r></a:p>
          <a:p><a:r><a:rPr lang="en-US" b="1" dirty="0"/><a:t>Bold</a:t></a:r><a:r><a:rPr i="1" dirty="0"/><a:t>Italic</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:grpSp>
        <p:nvGrpSpPr><p:cNvPr id="4" name="Group 4"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
        <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
        <p:sp>
          <p:nvSpPr><p:cNvPr id="5" name="Grouped Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
          <p:spPr/>
          <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Inside a group</a:t></a:r></a:p></p:txBody>
        </p:sp>
      </p:grpSp>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="6" name="Picture 6"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rIdImg1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="952500"/></a:xfrm></p:spPr>
      </p:pic>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="7" name="Picture 7"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rIdImg2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
        <p:spPr/>
      </p:pic>
      <p:graphicFrame>
        <p:nvGraphicFramePr><p:cNvPr id="8" name="Table 8"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
        <p:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></p:xfrm>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
            <a:tbl>
              <a:tr>
                <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Region</a:t></a:r></a:p></a:txBody></a:tc>
                <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Units</a:t></a:r></a:p></a:txBody></a:tc>
              </a:tr>
              <a:tr>
                <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>north</a:t></a:r></a:p></a:txBody></a:tc>
                <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>120</a:t></a:r></a:p></a:txBody></a:tc>
              </a:tr>
            </a:tbl>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`

/** Slide 1's relationships: two pictures (one External), and a notes part. */
const SLIDE_1_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELATIONSHIP_NS}">
  <Relationship Id="rIdImg1" Type="${TYPE_IMAGE}" Target="../media/image1.png"/>
  <Relationship Id="rIdImg2" Type="${TYPE_IMAGE}" Target="../media/logo.emf"/>
  <Relationship Id="rIdExt" Type="${TYPE_IMAGE}" Target="https://example.com/outside.png" TargetMode="External"/>
  <Relationship Id="rIdNotes" Type="${TYPE_NOTES}" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`

/** Slide 2 shows first in the deck and has no notes part at all. */
const SLIDE_2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS_DECLS}>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Second slide body</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`

const SLIDE_2_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELATIONSHIP_NS}">
  <Relationship Id="rIdLay" Type="${REL_SLIDE_PER}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`

const NOTES_SLIDE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes ${NS_DECLS}>
  <p:notesPr/>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder"/><p:cNvSpPr/><p:nvPr><p:ph type="slideImage"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Remember to mention the pilot</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:notesPr/>
</p:notes>`

/**
 * Layout / master parts exist in every real deck and carry boilerplate text the
 * slide itself does not. v1 does NOT inherit it, so none of this may surface.
 */
const SLIDE_LAYOUT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout ${NS_DECLS} type="obj">
  <p:cSld name="Title Slide">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Master Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>MASTER TEXT MUST NOT APPEAR</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`

/** The normal fixture. `overrides` replaces individual parts. */
function fixture(overrides = {}) {
  const parts = {
    'ppt/presentation.xml': PRESENTATION,
    'ppt/_rels/presentation.xml.rels': PRESENTATION_RELS,
    'ppt/slides/slide1.xml': SLIDE_1,
    'ppt/slides/_rels/slide1.xml.rels': SLIDE_1_RELS,
    'ppt/slides/slide2.xml': SLIDE_2,
    'ppt/slides/_rels/slide2.xml.rels': SLIDE_2_RELS,
    'ppt/notesSlides/notesSlide1.xml': NOTES_SLIDE,
    'ppt/slideLayouts/slideLayout1.xml': SLIDE_LAYOUT,
    'ppt/media/image1.png': PNG_1X1,
    'ppt/media/logo.emf': Buffer.from('fake-emf-bytes'),
    ...overrides,
  }
  return zip(Object.entries(parts).map(([name, data]) => ({ name, data })))
}

/** Every block of every slide, flattened. */
const allBlocks = result => result.slides.flatMap(slide => slide.blocks)
const blocksOf = (result, part) => result.slides.find(slide => slide.part === part)?.blocks ?? []
const findBlock = (result, predicate) => allBlocks(result).find(predicate)

// ── assertions ───────────────────────────────────────────────────────────────

let checks = 0
const check = async (label, fn) => {
  await fn()
  checks++
  console.log(`  ok  ${label}`)
}

console.log('dsh-pptx-sidebar :: pptx core')

await check('slides come back in p:sldIdLst order, not in filename order', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture() })
  assert.equal(result.state, 'OK')
  assert.equal(result.slides.length, 2)
  // rId8 resolves (via an absolute target) to slide2.xml and is listed first.
  assert.deepEqual(
    result.slides.map(slide => slide.part),
    ['ppt/slides/slide2.xml', 'ppt/slides/slide1.xml'],
  )
  assert.deepEqual(
    result.slides.map(slide => slide.index),
    [1, 2],
  )
})

await check('the title comes from the placeholder type, and its text is not empty', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture() })
  // Guards the historical bug where a bad close-tag test made every `inner`
  // empty: the whole deck would still render, just with nothing in it.
  assert.ok(allBlocks(result).length > 0, 'the reader produced no blocks at all')
  const title = findBlock(result, block => block.kind === 'title')
  assert.ok(title !== undefined, 'no title block was produced')
  assert.equal(title.text, 'Quarterly report')
})

await check('a:pPr@lvl drives bullet level, with and without an explicit marker', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture() })
  const bullets = allBlocks(result).filter(block => block.kind === 'bullet')
  assert.deepEqual(
    bullets.map(block => [block.text, block.level]),
    [
      ['Top bullet', 1],
      ['Nested bullet', 2],
      ['Indented without marker', 3], // lvl 2 with no buChar still indents
    ],
  )
})

await check('bold and italic runs survive', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture() })
  const runs = findBlock(result, block => block.text === 'BoldItalic')?.runs ?? []
  assert.deepEqual(
    runs.map(run => [run.text, run.bold === true, run.italic === true]),
    [
      ['Bold', true, false],
      ['Italic', false, true],
    ],
  )
})

await check('a grouped shape contributes its text once, inside its group position', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture() })
  const grouped = allBlocks(result).filter(block => block.text === 'Inside a group')
  // The classic double-count signature is 2 here: once as a sibling of the
  // group, once inside it.
  assert.equal(grouped.length, 1)
})

await check('an a:tbl graphic frame becomes rows, not stray paragraphs', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture() })
  const table = findBlock(result, block => block.kind === 'table')
  assert.ok(table !== undefined, 'no table block was produced')
  assert.deepEqual(table.rows, [
    ['Region', 'Units'],
    ['north', '120'],
  ])
  assert.equal(allBlocks(result).filter(block => block.text === 'Region').length, 0)
})

await check('a picture is read out of the archive with its EMU size', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture() })
  const image = findBlock(result, block => block.kind === 'image' && block.image?.unsupported !== true)?.image
  assert.ok(image !== undefined, 'no readable image block')
  assert.equal(image.mime, 'image/png')
  assert.equal(image.name, 'ppt/media/image1.png')
  assert.equal(image.widthPx, 200) // 1 905 000 EMU / 9525
  assert.equal(image.heightPx, 100)
  assert.deepEqual([...image.bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]) // real PNG signature
})

await check('an unrenderable format becomes a labelled placeholder, not a silent gap', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture() })
  const placeholder = findBlock(result, block => block.image?.unsupported === true)?.image
  assert.ok(placeholder !== undefined)
  assert.equal(placeholder.reason, 'EMF')
  assert.equal(placeholder.bytes.byteLength, 0)
})

await check('layout text is not inherited, and External targets are ignored', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture() })
  const everything = allBlocks(result).map(block => block.text).join('\n')
  assert.ok(!everything.includes('MASTER TEXT'), 'layout boilerplate leaked into the view')
  assert.equal(allBlocks(result).filter(block => block.image?.name.includes('example.com')).length, 0)
})

await check('speaker notes appear where they exist and stay silent where they do not', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture() })
  // No notes anywhere is the normal case for most decks: no warning, no error.
  assert.equal(result.warnings.length, 0)

  const withNotes = blocksOf(result, 'ppt/slides/slide1.xml')
  const note = withNotes.find(block => block.kind === 'note')
  assert.ok(note !== undefined, 'the notes part was not read')
  assert.equal(note.text, 'Remember to mention the pilot')
  assert.notEqual(note.text, '') // the slide-image placeholder must not be the only content

  const withoutNotes = blocksOf(result, 'ppt/slides/slide2.xml')
  assert.equal(withoutNotes.filter(block => block.kind === 'note').length, 0)
  assert.equal(result.meta.notesSlides, 1)
})

await check('counts add up', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture() })
  assert.equal(result.meta.slidesRendered, 2)
  assert.equal(result.meta.slidesTotal, 2)
  assert.equal(result.meta.images, 2) // the PNG plus the EMF placeholder
  assert.equal(result.meta.imagesSkipped, 0)
  assert.equal(result.meta.blocksRendered, allBlocks(result).length)
  assert.ok(result.meta.blocksTotal >= result.meta.blocksRendered)
})

await check('GATE: the archive ceiling blocks before any unpacking', async () => {
  const result = await pptx.readPptx({ fileName: 'big.pptx', bytes: fixture(), config: { maxFileSize: 10 } })
  assert.equal(result.state, 'BLOCKED')
  assert.equal(result.warnings[0].reason, 'file-size')
  assert.equal(result.slides.length, 0)
})

await check('GATE: a lying part size is refused from the directory alone', async () => {
  const lying = zip([
    { name: 'ppt/presentation.xml', data: PRESENTATION, declaredSize: 400 * 1024 * 1024 },
    { name: 'ppt/_rels/presentation.xml.rels', data: PRESENTATION_RELS },
  ])
  const result = await pptx.readPptx({ fileName: 'bomb.pptx', bytes: lying })
  assert.equal(result.state, 'BLOCKED')
  assert.equal(result.warnings[0].reason, 'part-bytes')
})

await check('GATE: the total inflate budget is enforced across parts', async () => {
  const lying = zip([
    { name: 'ppt/presentation.xml', data: PRESENTATION, declaredSize: 60 * 1024 * 1024 },
    { name: 'ppt/_rels/presentation.xml.rels', data: PRESENTATION_RELS },
  ])
  const result = await pptx.readPptx({
    fileName: 'bomb.pptx',
    bytes: lying,
    config: { maxPartBytes: 100 * 1024 * 1024, maxInflatedBytes: 50 * 1024 * 1024 },
  })
  assert.equal(result.state, 'BLOCKED')
  assert.equal(result.warnings[0].reason, 'inflated-bytes')
})

await check('GATE: a non-zip file is a readable error, never a throw', async () => {
  const result = await pptx.readPptx({ fileName: 'notes.txt', bytes: new TextEncoder().encode('hello there') })
  assert.equal(result.state, 'BLOCKED')
  assert.equal(result.warnings[0].reason, 'container-error')
  assert.equal(result.slides.length, 0)
})

await check('GATE: an oversized picture is skipped without being inflated', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture(), config: { maxImageBytes: 10 } })
  assert.equal(result.state, 'TRUNCATED')
  assert.equal(result.warnings.filter(warning => warning.reason === 'image-bytes').length, 1)
  assert.ok(result.meta.imagesSkipped >= 1)
  // The EMF placeholder costs no bytes and is still reported as an image.
  assert.equal(findBlock(result, block => block.image?.unsupported === true) !== undefined, true)
})

await check('GATE: the slide ceiling truncates the deck, one warning only', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture(), config: { maxSlides: 1 } })
  assert.equal(result.state, 'TRUNCATED')
  assert.equal(result.meta.slidesRendered, 1)
  assert.equal(result.meta.slidesTotal, 2)
  assert.equal(result.warnings.filter(warning => warning.reason === 'slides').length, 1)
  assert.deepEqual(result.slides.map(slide => slide.part), ['ppt/slides/slide2.xml'])
})

await check('GATE: a runaway slide loses only its own tail', async () => {
  const result = await pptx.readPptx({ fileName: 'deck.pptx', bytes: fixture(), config: { maxSlideText: 20 } })
  assert.equal(result.state, 'TRUNCATED')
  assert.equal(result.warnings.filter(warning => warning.reason === 'text-length').length, 1)
  // Slide 1 stops early: its title fits inside 20 characters, later text does not.
  const first = blocksOf(result, 'ppt/slides/slide1.xml')
  assert.equal(first[0].text, 'Quarterly report')
  assert.equal(allBlocks(result).filter(block => block.text === 'Inside a group').length, 0)
  // The other slide is short enough and must survive intact.
  assert.equal(blocksOf(result, 'ppt/slides/slide2.xml')[0].text, 'Second slide body')
})

await check('every warning renders with no leftover placeholder in zh or en', async () => {
  const lying = zip([
    { name: 'ppt/presentation.xml', data: PRESENTATION, declaredSize: 400 * 1024 * 1024 },
    { name: 'ppt/_rels/presentation.xml.rels', data: PRESENTATION_RELS },
  ])
  const results = [
    await pptx.readPptx({ fileName: 'a.pptx', bytes: fixture(), config: { maxFileSize: 10 } }),
    await pptx.readPptx({ fileName: 'b.pptx', bytes: lying }),
    await pptx.readPptx({ fileName: 'c.txt', bytes: new TextEncoder().encode('nope') }),
    await pptx.readPptx({ fileName: 'd.pptx', bytes: fixture(), config: { maxSlides: 1 } }),
    await pptx.readPptx({ fileName: 'e.pptx', bytes: fixture(), config: { maxSlideText: 5 } }),
    await pptx.readPptx({ fileName: 'f.pptx', bytes: fixture(), config: { maxImageBytes: 10 } }),
    await pptx.readPptx({ fileName: 'g.pptx', bytes: fixture(), config: { maxImages: 0 } }),
  ]

  const warnings = results.flatMap(result => result.warnings)
  const reasons = new Set(warnings.map(warning => warning.reason))
  for (const required of ['file-size', 'part-bytes', 'container-error', 'slides', 'text-length', 'image-bytes', 'images']) {
    assert.ok(reasons.has(required), `no warning of reason ${required} was produced`)
  }

  for (const warning of warnings) {
    for (const [lang, dict] of Object.entries(dictionaries)) {
      const template = dict[`warning.${warning.reason}`]
      assert.ok(template !== undefined, `${lang} has no template for warning.${warning.reason}`)
      const rendered = interpolate(template, warning.detail)
      assert.ok(!rendered.includes('{'), `${lang} ${warning.reason} left a placeholder: ${rendered}`)
    }
  }

  // One dimension, one line — structural in the breaker (a Map keyed by reason).
  for (const result of results) {
    const seen = result.warnings.map(warning => warning.reason)
    assert.equal(new Set(seen).size, seen.length, `duplicate warning reasons: ${seen.join(', ')}`)
  }
})

await check('SCALE: the layout at the base width is unchanged', () => {
  // The property that makes this an adaptation rather than a redesign: at the
  // base pane width every `em` in the stylesheet resolves to the pixel value it
  // replaced, so nobody's existing slide width shifts.
  assert.equal(scale.readerScaleFor(scale.READER_SCALE.base), 1)
  assert.equal(scale.quantizeScale(1), 1)
})

await check('SCALE: it shrinks when narrow and grows when wide, within bounds', () => {
  const { base, min, max } = scale.READER_SCALE

  assert.equal(scale.readerScaleFor(base * 0.5), min, 'a very narrow pane must stop at the floor')
  assert.equal(scale.readerScaleFor(base * 3), max, 'a very wide pane must stop at the ceiling')

  // Monotonic, so dragging a divider never moves the type the wrong way.
  let previous = 0
  for (let width = 100; width <= 900; width += 25) {
    const value = scale.readerScaleFor(width)
    assert.ok(value >= previous, `scale went backwards at width ${width}`)
    previous = value
  }

  assert.ok(scale.readerScaleFor(base * 1.05) > scale.readerScaleFor(base * 0.95))
})

await check('SCALE: an unmeasurable pane falls back to the shipped layout', () => {
  // Not to a bound: before the first observer callback the width can be 0, and
  // rendering that as "as narrow as possible" would flash tiny type on open.
  // Infinity is not a width either — it is a broken report, not a wide pane.
  for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(scale.readerScaleFor(width), 1, `width ${width} should fall back`)
  }
})

await check('SCALE: values are quantised so a drag does not re-lay-out per pixel', () => {
  const value = scale.readerScaleCss(scale.READER_SCALE.base * 1.03)
  assert.ok(/^\d+\.\d{1,2}$/.test(value), `unexpected precision: ${value}`)
})

await check('SCALE: the bullet indent stays in proportion with the body text', () => {
  // The indent is in `em` now, so it must come out at the 14px it used to be
  // when the scale is 1 — the same "nothing moves at the base width" contract.
  const indentPx = scale.INDENT_EM * 13
  assert.ok(Math.abs(indentPx - 14) < 0.2, `indent drifted to ${indentPx}px`)
})

rmSync(outDir, { recursive: true, force: true })
console.log(`\ndsh-pptx-sidebar :: ${checks} checks passed, 0 failed`)
