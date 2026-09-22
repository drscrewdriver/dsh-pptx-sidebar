import type { PptxConfig, PptxResult, SlideBlock } from './types';
/** What the caller hands over. */
export interface PptxInput {
    fileName: string;
    bytes: Uint8Array;
    config?: Partial<PptxConfig>;
}
/** One relationship, plus enough of its type to route it. */
interface Relationship {
    target: string;
    external: boolean;
    type: string;
}
/** Read a `.pptx`. Never throws: every failure comes back as a BLOCKED result. */
export declare function readPptx(input: PptxInput): Promise<PptxResult>;
/**
 * `baseDir` is the directory of the part that OWNS the relationships file, so a
 * target is resolved from there — `/foo` is absolute from the package root,
 * `../media/x.png` climbs out of `ppt/slides/`. Without the `..` fold these
 * targets never resolve and every picture silently disappears.
 */
export declare function resolvePart(baseDir: string, target: string): string;
/** `rId → relationship` from a relationships part. */
export declare function parseRelationships(xml: string): Map<string, Relationship>;
/**
 * `r:id` of every `<p:sldId …/>` in `p:sldIdLst`, in the order the deck shows
 * them. This list is the single source of slide order.
 */
export declare function parseSlideOrder(presentationXml: string): string[];
/**
 * Ordered slide parts: `p:sldIdLst` supplies the order, presentation rels supply
 * the mapping. A relationship that is missing or External contributes nothing —
 * it is not in the archive, so there is nothing to read.
 */
export declare function slideParts(slideOrder: string[], relationships: Map<string, Relationship>): {
    part: string;
    index: number;
}[];
/**
 * One node of the shape tree, as walked by `parseShapeTree`.
 *
 * `p:grpSp` holds nested shapes (`children`); `p:sp`, `p:pic` and
 * `p:graphicFrame` are leaves as far as this tree is concerned.
 */
interface ShapeNode {
    name: 'sp' | 'pic' | 'graphicFrame' | 'grpSp';
    inner: string;
    children: ShapeNode[];
}
/**
 * Build the shape tree of one `p:spTree`.
 *
 * The four container names are tracked with a single depth counter, so a shape
 * nested inside a group is attributed to that group instead of being emitted
 * twice — and a scanner that simply matched every `<p:sp` (the naive approach)
 * would both flatten groups and double-count their contents.
 */
export declare function parseShapeTree(treeXml: string): ShapeNode[];
/**
 * One `p:sp` → its paragraph blocks.
 *
 * Whether a shape is a title comes from its placeholder *type*
 * (`title` / `ctrTitle`), not from being first or from its text size — the same
 * reasoning as choosing style *names* over style ids in WordprocessingML.
 *
 * Bullets are per paragraph: `a:pPr@lvl` is 0-based, so level 0 is the outermost
 * bullet (rendered as level 1), and an explicit `a:buChar` / `a:buAutoNum` or a
 * non-zero level both mean "this paragraph is a bullet".
 */
export declare function parseShapeText(sp: ShapeNode): SlideBlock[];
/**
 * Rows of an `a:tbl` carried by a graphic frame, or undefined when the frame
 * holds something else (a chart, a diagram). `undefined` is deliberate: emitting
 * an empty table there would look like content that failed to render.
 */
export declare function tableOf(graphicFrameXml: string): string[][] | undefined;
export {};
