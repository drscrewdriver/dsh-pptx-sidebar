/**
 * Zip container reading, with the two gates a compressed format needs.
 *
 * A `.pptx` is a zip: the archive is small by construction, so a size check on
 * the file itself defends nothing. Two gates run instead —
 *
 * 1. a **declared-size** gate from the central directory, *before* any inflate
 *    work (deterministic front-loading: refuse before spending CPU);
 * 2. a **streaming byte budget** while inflating, because those declared sizes
 *    are attacker-controlled and may lie.
 *
 * Copied from dsh-docx-sidebar on purpose: plugins stay self-contained, and two
 * users of this code is not yet the threshold for extracting a shared package
 * (that would add a third thing to publish and version-lock).
 */
/** One central-directory entry. Sizes come from the directory, never the local header. */
export interface ZipEntry {
    name: string;
    /** 0 = stored, 8 = deflate. */
    method: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
}
/** Raised when inflation crosses a budget. */
export declare class BudgetExceeded extends Error {
    readonly bytes: number;
    readonly limit: number;
    constructor(bytes: number, limit: number);
}
/** Parse the central directory (its record sits near the tail, after any comment). */
export declare function listZipEntries(bytes: Uint8Array): ZipEntry[];
/**
 * Inflate one entry, aborting the moment `limit` is crossed.
 *
 * The limit is enforced on the *decoded* stream, so a lying header cannot buy
 * unbounded memory.
 */
export declare function inflateEntry(bytes: Uint8Array, entry: ZipEntry, limit: number): Promise<Uint8Array>;
