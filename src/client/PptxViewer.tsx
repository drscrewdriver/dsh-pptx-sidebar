/**
 * The deck viewer. Renders the slides the reader produced — and nothing it did
 * not: there is no attempt to imitate PowerPoint's layout, and the header strip
 * says so, because a visual difference that looks like a rendering bug is worse
 * than a plainly-labelled reading view.
 *
 * Two things here are deliberate rather than incidental:
 *
 * - **The strip.** Slides are listed by their position in `p:sldIdLst`, which is
 *   the order they are *shown* in — not the order their part files sort.
 * - **Object URLs.** Pictures live inside the archive, so there is no host route
 *   to point at; they are turned into blob URLs here and revoked when the result
 *   changes or the viewer unmounts. Skipping the revoke leaks every deck opened.
 */
import { useEffect, useState } from 'react'
import { readPptx } from './pptx'
import { formatBytes } from './circuit-breaker'
import { INDENT_EM } from './scale'
import { useReaderScale } from './useReaderScale'
import { basename } from './utils'
import type { KeyboardEvent, ReactNode } from 'react'
import type { T } from './locales'
import type { PptxResult, SlideBlock, SlideInfo, TextRun } from './types'

/** Above this many slides the strip would push its own tabs forever; it folds. */
const TAB_LIMIT = 60

interface PptxViewerProps {
  path: string
  title?: string
  /** Raw archive bytes, from the registered `custom` loader. */
  customData?: unknown
  t: T
}

/** True when the loader handed us something we can read. */
function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array
}

export function PptxViewer({ path, title, customData, t }: PptxViewerProps) {
  const fileName = title !== undefined && title !== '' ? title : basename(path)
  const [result, setResult] = useState<PptxResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [urls, setUrls] = useState<Record<string, string>>({})
  // Drives `--reader-scale` from the pane width; every root below carries it so
  // the scale survives the loading → ready swap.
  const rootRef = useReaderScale<HTMLDivElement>()

  useEffect(() => {
    if (!isBytes(customData)) return
    let cancelled = false
    void (async () => {
      try {
        const read = await readPptx({ fileName, bytes: customData })
        if (cancelled) return
        setResult(read)
        setCurrent(0)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [customData, fileName])

  // One object URL per distinct picture, revoked on change/unmount.
  useEffect(() => {
    if (result === null) return
    const created: Record<string, string> = {}
    for (const slide of result.slides) {
      for (const block of slide.blocks) {
        const image = block.image
        if (image === undefined || image.unsupported === true || image.bytes.byteLength === 0) continue
        if (created[image.name] !== undefined) continue
        created[image.name] = URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.mime }))
      }
    }
    setUrls(created)
    return () => {
      for (const url of Object.values(created)) URL.revokeObjectURL(url)
    }
  }, [result])

  if (!isBytes(customData) || (result === null && error === null)) {
    return (
      <div className="pptx-root" ref={rootRef}>
        <div className="pptx-loading">
          <div className="pptx-spinner" />
          <div>{t('state.loading')}</div>
        </div>
      </div>
    )
  }

  if (error !== null) {
    return (
      <div className="pptx-root" ref={rootRef}>
        <div className="pptx-error">
          <div className="pptx-error__title">❌ {t('state.error')}</div>
          <div className="pptx-error__hint">{error}</div>
        </div>
      </div>
    )
  }

  const deck = result as PptxResult
  const { meta, warnings, state } = deck
  const slides = deck.slides
  const slide = slides[Math.min(current, slides.length - 1)]

  /** ←/→ step through the deck, scoped to this element so nothing else is hijacked. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (slides.length === 0) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setCurrent(index => Math.max(0, index - 1))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setCurrent(index => Math.min(slides.length - 1, index + 1))
    }
  }

  return (
    <div className="pptx-root" tabIndex={0} onKeyDown={onKeyDown} ref={rootRef}>
      <div className="pptx-head">
        <span className="pptx-head__name" title={meta.fileName}>
          📽 {meta.fileName}
        </span>
        <span className="pptx-head__tag">{formatBytes(meta.fileSize)}</span>
        <span className="pptx-head__tag">
          {t('deck.units', { slides: meta.slidesRendered, images: meta.images })}
        </span>
        {meta.imagesSkipped > 0 && (
          <span className="pptx-head__tag">{t('deck.unitsSkipped', { n: meta.imagesSkipped })}</span>
        )}
        {/* The one thing a reader must not have to guess. */}
        <span className="pptx-head__badge">{t('deck.badge')}</span>
      </div>

      {warnings.length > 0 && <PptxWarning state={state} warnings={warnings} t={t} />}

      {state === 'BLOCKED' ? (
        <div className="pptx-empty">
          <div className="pptx-empty__title">⛔ {t('deck.blocked')}</div>
          <div className="pptx-empty__hint">{t('deck.blockedHint')}</div>
        </div>
      ) : slides.length === 0 || slide === undefined ? (
        <div className="pptx-empty">
          <div className="pptx-empty__title">{t('deck.empty')}</div>
          <div className="pptx-empty__hint">{t('deck.emptyHint')}</div>
        </div>
      ) : (
        <>
          <SlideStrip slides={slides} current={Math.min(current, slides.length - 1)} onPick={setCurrent} t={t} />
          <div className="pptx-body">
            <div className="pptx-slide__num">{t('deck.slide', { n: slide.index })}</div>
            {slide.blocks.map((block, index) => (
              <Block key={index} block={block} urls={urls} t={t} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** The slide spine: one tab per slide, or a select once tabs stop fitting. */
function SlideStrip({
  slides,
  current,
  onPick,
  t,
}: {
  slides: SlideInfo[]
  current: number
  onPick: (index: number) => void
  t: T
}) {
  if (slides.length > TAB_LIMIT) {
    return (
      <div className="pptx-strip">
        <select
          className="pptx-strip__select"
          aria-label={t('deck.selectSlide')}
          value={current}
          onChange={event => onPick(Number(event.target.value))}
        >
          {slides.map((slide, index) => (
            <option key={slide.part} value={index}>
              {index + 1}
            </option>
          ))}
        </select>
        <span className="pptx-head__tag">{t('deck.slide', { n: current + 1 })}</span>
      </div>
    )
  }

  return (
    <div className="pptx-strip" role="tablist">
      {slides.map((slide, index) => (
        <button
          key={slide.part}
          type="button"
          role="tab"
          aria-selected={index === current}
          className={`pptx-strip__tab${index === current ? ' pptx-strip__tab--current' : ''}`}
          onClick={() => onPick(index)}
        >
          {index + 1}
        </button>
      ))}
    </div>
  )
}

/** The breaker banner: one line per tripped dimension. */
function PptxWarning({
  state,
  warnings,
  t,
}: {
  state: PptxResult['state']
  warnings: PptxResult['warnings']
  t: T
}) {
  const blocked = state === 'BLOCKED'
  return (
    <div className={`pptx-warning${blocked ? ' pptx-warning--blocked' : ''}`} role="status">
      <div className="pptx-warning__head">
        <span aria-hidden="true">{blocked ? '⛔' : '⚠️'}</span>
        <span>{t(blocked ? 'warning.blockedTitle' : 'warning.truncatedTitle')}</span>
      </div>
      <ul className="pptx-warning__list">
        {warnings.map(warning => (
          <li key={warning.reason}>• {t(`warning.${warning.reason}`, warning.detail)}</li>
        ))}
      </ul>
    </div>
  )
}

/** One block, by kind. */
function Block({ block, urls, t }: { block: SlideBlock; urls: Record<string, string>; t: T }) {
  switch (block.kind) {
    case 'title':
      return <div className="pptx-title">{runs(block.runs ?? [{ text: block.text }])}</div>
    case 'bullet':
      return (
        <div className="pptx-bullet" style={{ marginLeft: `${((block.level ?? 1) - 1) * INDENT_EM}em` }}>
          {runs(block.runs ?? [{ text: block.text }])}
        </div>
      )
    case 'table': {
      const rows = block.rows ?? []
      const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
      return (
        <div className="pptx-table-wrap">
          <div className="pptx-table__caption">{t('deck.table', { rows: rows.length, cols: width })}</div>
          <table className="pptx-table">
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) =>
                    rowIndex === 0 ? <th key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>,
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'image': {
      const image = block.image
      if (image === undefined) return null
      const url = urls[image.name]
      return (
        <div className="pptx-image">
          {url === undefined ? (
            <span className="pptx-image__placeholder">
              🖼{' '}
              {image.unsupported === true
                ? t('deck.imageUnsupported', { kind: image.reason ?? '' })
                : t('deck.imageSkipped')}
            </span>
          ) : (
            <img
              src={url}
              alt={image.name}
              {...(image.widthPx !== undefined ? { width: image.widthPx } : {})}
              {...(image.heightPx !== undefined ? { height: image.heightPx } : {})}
            />
          )}
          <div className="pptx-image__meta">
            {image.name}
            {image.widthPx !== undefined && image.heightPx !== undefined
              ? ` · ${image.widthPx}×${image.heightPx}`
              : ''}
          </div>
        </div>
      )
    }
    case 'note':
      return (
        <div className="pptx-note">
          <span className="pptx-note__label">{t('deck.notes')}</span>
          {block.text}
        </div>
      )
    default:
      return <div className="pptx-p">{runs(block.runs ?? [{ text: block.text }])}</div>
  }
}

/** Inline runs, with the formatting this view honours. */
function runs(items: TextRun[]): ReactNode[] {
  return items.map((run, index) => {
    if (run.bold !== true && run.italic !== true && run.underline !== true) {
      return <span key={index}>{run.text}</span>
    }
    return (
      <span
        key={index}
        style={{
          ...(run.bold === true ? { fontWeight: 600 } : {}),
          ...(run.italic === true ? { fontStyle: 'italic' as const } : {}),
          ...(run.underline === true ? { textDecoration: 'underline' } : {}),
        }}
      >
        {run.text}
      </span>
    )
  })
}
