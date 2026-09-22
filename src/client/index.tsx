/**
 * Browser half — the Cordis client entry.
 *
 * The integration contract, in four points:
 *
 * 1. DSH's client module system evaluates a script calling
 *    `window.__ModuleLoader__.load({ id, factory })`; the factory returns an
 *    object exposing `apply` (+ `inject`). `scripts/build.mjs` synthesises that
 *    wrapper, so this source stays ordinary ESM.
 * 2. `inject` is declared, so Cordis activates us only once `betterSidebar` and
 *    `locale` are published — registration order never matters. `betterSidebar`
 *    is a hard declaration but a SOFT dependency: the runtime guard below warns
 *    loudly and leaves the plugin inert instead of half-installing it.
 * 3. A `.pptx` is binary, and `fsRead` answers a binary file with a head-only
 *    result — so the viewer registers with a `custom` loader that pulls bytes off
 *    better-sidebar's own `/sidebar/file` route, keeping the workspace path fence
 *    on the host side.
 * 4. Everything rides `ctx.effect`, so HMR / disable revokes it.
 *
 * Sibling viewers register `.docx` and spreadsheet formats with their own ids;
 * the priorities below leave room between them without claiming the whole range.
 */
import { createElement } from 'react'
import { PptxViewer } from './PptxViewer'
import { NS, dictionaries, interpolate, translatorFrom } from './locales'
import { clientContextOf, sidebarFileUrl } from './seams'
import css from './styles.css'
import type { T } from './locales'
import type { ClientContext, SessionScopeLike } from './seams'

/** Viewer id, as it appears in the Side card's preview inventory. */
export const VIEWER_ID = 'dsh-pptx-sidebar:viewer'

/** Services that must be published before `apply` runs. */
export const inject = ['betterSidebar', 'locale'] as const

/** Id of the injected <style> tag, so a re-apply can detect its own work. */
const STYLE_ID = 'dsh-pptx-sidebar-styles'

/** Append the stylesheet once; the disposer removes it. */
function injectStyles(): () => void {
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = css
  document.head.appendChild(tag)
  return () => tag.remove()
}

/** Bind a translator to our namespace, falling back to the built-in English. */
function translatorOf(ctx: ClientContext): T {
  const locale = ctx.locale
  if (locale === undefined) return translatorFrom(dictionaries.en)
  return (key, vars) => {
    try {
      const bound = locale.bind(NS)(key)
      return interpolate(bound === '' ? key : bound, vars)
    } catch {
      return interpolate(key, vars)
    }
  }
}

/**
 * Browser-face apply.
 *
 * @param rawCtx - the client root context, narrowed structurally in `seams.ts`.
 */
export function apply(rawCtx: unknown): void {
  const ctx = clientContextOf(rawCtx)

  ctx.effect(injectStyles, 'dsh-pptx-sidebar: stylesheet')

  if (ctx.locale !== undefined) {
    for (const [tag, dict] of Object.entries(dictionaries)) {
      ctx.effect(() => ctx.locale!.register(NS, tag, dict), `dsh-pptx-sidebar: dictionary ${tag}`)
    }
  }

  const t = translatorOf(ctx)
  const bar = ctx.betterSidebar

  if (bar === undefined) {
    console.warn('[dsh-pptx-sidebar] ctx.betterSidebar 未发布：dsh-better-sidebar 未安装或已禁用，演示文稿预览保持惰性。')
    return
  }

  ctx.effect(
    () =>
      bar.registerFileViewer({
        id: VIEWER_ID,
        title: () => t('viewer.title'),
        exts: ['pptx', 'pptm'],
        priority: 50, // above the default 0; the built-in `code` viewer sits at -100
        fetchStrategy: 'custom',
        load: async (path: string, scope: SessionScopeLike, signal?: AbortSignal) => {
          const response = await fetch(sidebarFileUrl(scope, path), { signal })
          if (!response.ok) throw new Error(`HTTP ${response.status} while reading ${path}`)
          return new Uint8Array(await response.arrayBuffer())
        },
        component: props =>
          createElement(PptxViewer, {
            path: props.path,
            title: props.title,
            customData: props.customData,
            t,
          }),
      }),
    'dsh-pptx-sidebar: presentation viewer',
  )

  console.log('[dsh-pptx-sidebar] 已注册：演示文稿预览器 (.pptx/.pptm)')
}
