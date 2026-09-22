/**
 * Plugin-owned dictionaries, registered through the DSH locale service under our
 * own namespace. `en` is the fallback; a missing key renders the key itself,
 * never a blank, so a translation gap is visible instead of silent.
 *
 * Every `BreakerReason` has a template here and every template's placeholders are
 * covered by the test suite — a format that renders `{found}` literally is worse
 * than no message at all, because it looks like a bug rather than like data.
 */

/** Namespace for every key below. */
export const NS = 'dsh-pptx-sidebar'

/** The two built-in languages this plugin ships. */
export const dictionaries: Record<string, Record<string, string>> = {
  en: {
    'viewer.title': 'Presentation',
    'deck.badge': 'reading view — not a slide reproduction',
    'deck.units': '{slides} slides · {images} images',
    'deck.unitsSkipped': '{n} images skipped',
    'deck.notes': 'notes',
    'deck.slide': 'slide {n}',
    'deck.selectSlide': 'go to slide…',
    'deck.empty': 'Nothing to show',
    'deck.emptyHint': 'This deck has no slides with text, pictures or notes.',
    'deck.blocked': 'Blocked by the circuit breaker',
    'deck.blockedHint': 'This file exceeds a ceiling. Narrow it down first, or open it elsewhere.',
    'deck.table': 'table {rows}×{cols}',
    'deck.image': 'image',
    'deck.imageUnsupported': 'not drawn ({kind})',
    'deck.imageSkipped': 'image skipped',
    'state.loading': 'Reading…',
    'state.error': 'Could not read this deck',

    'warning.blockedTitle': 'Too large to read — blocked',
    'warning.truncatedTitle': 'Content truncated to keep the tab responsive',
    'warning.file-size': 'Archive is {found} — the ceiling is {limit}',
    'warning.container-error': 'This file cannot be read: {message}',
    'warning.inflated-bytes': 'This archive unpacks to {found} — past the {limit} budget, so it was refused',
    'warning.part-bytes': 'One part unpacks to {found} — past its {limit} ceiling',
    'warning.slides': '{kept} of at least {found} slides shown',
    'warning.text-length': 'One slide held {found} characters — elided at {limit}',
    'warning.images': 'Only the first {kept} images are shown ({found} found)',
    'warning.image-bytes': 'An image is {found} — past its {limit} ceiling, so it was skipped',
    'warning.parse-error': 'The deck is malformed: {message}',
  },
  zh: {
    'viewer.title': '演示文稿',
    'deck.badge': '阅读视图 —— 非版式还原',
    'deck.units': '{slides} 页 · {images} 张图',
    'deck.unitsSkipped': '跳过 {n} 张图',
    'deck.notes': '备注',
    'deck.slide': '第 {n} 页',
    'deck.selectSlide': '跳转幻灯片…',
    'deck.empty': '没有可显示的内容',
    'deck.emptyHint': '该演示文稿没有任何含文本、图片或备注的幻灯片。',
    'deck.blocked': '已被熔断器阻止',
    'deck.blockedHint': '文件超过上限，请先切分或改用其他方式打开。',
    'deck.table': '表格 {rows}×{cols}',
    'deck.image': '图片',
    'deck.imageUnsupported': '未绘制（{kind}）',
    'deck.imageSkipped': '图片已跳过',
    'state.loading': '正在读取…',
    'state.error': '无法读取该演示文稿',

    'warning.blockedTitle': '文件过大，已阻止读取',
    'warning.truncatedTitle': '内容已截断，以保证侧栏不卡死',
    'warning.file-size': '归档 {found}，上限 {limit}',
    'warning.container-error': '无法读取该文件：{message}',
    'warning.inflated-bytes': '该归档解压后达 {found}，超过 {limit} 预算，已拒绝加载',
    'warning.part-bytes': '某个部件解压后达 {found}，超过 {limit} 上限',
    'warning.slides': '共至少 {found} 页，已显示前 {kept} 页',
    'warning.text-length': '某页有 {found} 字符，已在 {limit} 处省略',
    'warning.images': '仅显示前 {kept} 张图片（共 {found} 张）',
    'warning.image-bytes': '某张图片 {found}，超过 {limit} 上限，已跳过',
    'warning.parse-error': '演示文稿格式异常：{message}',
  },
}

/** Values substituted into a `{placeholder}` template. */
export type TVars = Record<string, string | number>

/** A translate function bound to the plugin namespace. */
export type T = (key: string, vars?: TVars) => string

/** Substitute `{name}` placeholders; unknown placeholders stay literal. */
export function interpolate(template: string, vars?: TVars): string {
  if (vars === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name]
    return value === undefined ? match : String(value)
  })
}

/** Build a `T` from a raw dictionary — used when no locale service exists. */
export function translatorFrom(dict: Record<string, string>): T {
  return (key, vars) => interpolate(dict[key] ?? key, vars)
}
