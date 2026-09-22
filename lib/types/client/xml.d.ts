/**
 * Targeted XML scanning. PresentationML is machine-generated and regular, so a
 * few well-defined scans beat a general parser — and they run in Node, which
 * keeps the parser unit-testable.
 */
/** Resolve entities and numeric escapes. */
export declare function decodeXml(text: string): string;
/** One attribute of a start tag, or undefined. */
export declare function attributeOf(tag: string, name: string): string | undefined;
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
export declare function findElements(xml: string, tag: string): {
    tag: string;
    inner: string;
}[];
/** Every start tag of one element name (self-closing included). */
export declare function findAll(xml: string, tag: string): string[];
/** First `<tag …>` start tag, or undefined. */
export declare function firstTag(xml: string, tag: string): string | undefined;
/**
 * Visible text of a DrawingML fragment: `a:t` runs, tabs and breaks, in order.
 *
 * `a:br` and `a:tab` are line structure, not whitespace: dropping them would run
 * two bullet items into one line, so they become `\n` and `\t` (the renderer
 * honours `white-space: pre-wrap` for exactly this reason).
 */
export declare function runText(xml: string): string;
/** True when a DrawingML boolean-ish attribute is present and not off. */
export declare function isOn(tag: string, name: string): boolean;
