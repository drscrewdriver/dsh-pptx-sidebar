/**
 * Targeted XML scanning. PresentationML is machine-generated and regular, so a
 * few well-defined scans beat a general parser — and they run in Node, which
 * keeps the parser unit-testable.
 */

/** Resolve entities and numeric escapes. */
export function decodeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (match, body: string) => {
    switch (body) {
      case 'amp':
        return '&'
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'quot':
        return '"'
      case 'apos':
        return "'"
      default: {
        const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : match
      }
    }
  })
}

/** One attribute of a start tag, or undefined. */
export function attributeOf(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`)
  const found = pattern.exec(tag)
  if (found === null) return undefined
  return decodeXml(found[2] ?? found[3] ?? '')
}

/**
 * Every complete `<tag …>…</tag>` element, including nested ones up to their own
 * matching close. Returns `{ tag, inner }` per match, in document order.
 *
 * PresentationML nests the same element name (`p:sp` inside `p:grpSp`), so a
 * regex cannot balance it — this walks with a depth counter, which is the whole
 * reason it is not a one-liner.
 *
 * Note the close test below: a close tag is the only alternative in the scanning
 * pattern that starts with `</`. Testing the literal `<tag>` here instead would
 * never match, the depth would never unwind, and `inner` would be silently empty
 * on every element — a bug already hit once in the sibling plugin (the symptom
 * was a reader that produced only the notes block). Every caller therefore has
 * at least one "the output is not empty" assertion.
 */
export function findElements(xml: string, tag: string): { tag: string; inner: string }[] {
  const out: { tag: string; inner: string }[] = []
  const open = new RegExp(`<${tag}(\\s[^>]*?)?(/?)>`, 'g')

  for (let match = open.exec(xml); match !== null; match = open.exec(xml)) {
    if (match[2] === '/') {
      out.push({ tag: match[0], inner: '' })
      continue
    }
    // Walk forward counting same-name opens and closes to find the matching end.
    let depth = 1
    const cursor = open.lastIndex
    const openAgain = new RegExp(`<${tag}(\\s[^>]*?)?(/?)>|</${tag}>`, 'g')
    openAgain.lastIndex = cursor
    let inner = ''
    for (let step = openAgain.exec(xml); step !== null; step = openAgain.exec(xml)) {
      // A close tag is the only alternative that starts with `</`; testing the
      // literal `<tag>` here would never match and the depth would never unwind.
      if (step[0].startsWith('</')) {
        depth--
        if (depth === 0) {
          inner = xml.slice(cursor, step.index)
          open.lastIndex = openAgain.lastIndex
          break
        }
      } else if (step[2] !== '/') {
        depth++
      }
    }
    out.push({ tag: match[0], inner })
  }
  return out
}

/** Every start tag of one element name (self-closing included). */
export function findAll(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}(\\s[^>]*?)?/?>`, 'g')
  const tags: string[] = []
  for (let found = pattern.exec(xml); found !== null; found = pattern.exec(xml)) tags.push(found[0])
  return tags
}

/** First `<tag …>` start tag, or undefined. */
export function firstTag(xml: string, tag: string): string | undefined {
  return findAll(xml, tag)[0]
}

/**
 * Visible text of a DrawingML fragment: `a:t` runs, tabs and breaks, in order.
 *
 * `a:br` and `a:tab` are line structure, not whitespace: dropping them would run
 * two bullet items into one line, so they become `\n` and `\t` (the renderer
 * honours `white-space: pre-wrap` for exactly this reason).
 */
export function runText(xml: string): string {
  let out = ''
  const pattern = /<a:t(\s[^>]*?)?>([\s\S]*?)<\/a:t>|<a:t(\s[^>]*?)?\/>|<a:tab(\s[^>]*?)?\/>|<a:br(\s[^>]*?)?\/>/g
  for (let found = pattern.exec(xml); found !== null; found = pattern.exec(xml)) {
    if (found[2] !== undefined) out += decodeXml(found[2])
    else if (found[0].startsWith('<a:tab')) out += '\t'
    else if (found[0].startsWith('<a:br')) out += '\n'
  }
  return out
}

/** True when a DrawingML boolean-ish attribute is present and not off. */
export function isOn(tag: string, name: string): boolean {
  const found = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag)
  if (found === null) return false
  const value = found[2] ?? found[3] ?? ''
  return !/^(0|false|off)$/i.test(value)
}
