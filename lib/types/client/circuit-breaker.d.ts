/**
 * The circuit breaker, deck edition.
 *
 * Seven ceilings, each able to stop the reader early rather than after the
 * damage:
 *
 * | dimension      | default | over it                                       |
 * |----------------|---------|-----------------------------------------------|
 * | archive size   | 8 MB    | BLOCKED — refused before any unpacking         |
 * | total inflate  | 64 MB   | BLOCKED — the zip-bomb gate                    |
 * | one part       | 32 MB   | BLOCKED — a single oversized XML part          |
 * | slides         | 300     | TRUNCATED — the reader stops walking the deck  |
 * | slide text     | 20 000  | that slide's remaining text elided, warned     |
 * | images         | 200     | further pictures skipped, warned               |
 * | one image      | 8 MB    | that picture skipped, warned                   |
 *
 * **At most one warning per reason** is structural here (a Map keyed by
 * reason), not a convention: a dimension that trips twice — once per slide, say
 * — would otherwise render a banner line per slide. A sibling plugin shipped
 * exactly that bug and had to publish a patch release for it.
 *
 * The per-slide text ceiling elides only the offending slide: a deck with one
 * runaway slide stays readable everywhere else (a per-block ceiling would
 * instead shave every slide equally, losing information the reader had budget
 * for).
 *
 * Pure module: no DOM, no React, no imports beyond local types.
 */
import type { BreakerReason, BreakerState, BreakerWarning, PptxConfig, PptxImage, PptxMeta, PptxResult, SlideBlock } from './types';
/** Ceilings. Three container gates plus four deck budgets. */
export declare const DEFAULT_CONFIG: PptxConfig;
/** Human-readable byte size. */
export declare function formatBytes(bytes: number): string;
/** The breaker's mutable face. */
export interface PptxBreaker {
    readonly config: PptxConfig;
    /** Enter READING and seed the metadata the header strip shows. */
    startReading(seed: Partial<PptxMeta>): void;
    /**
     * Open one slide. Returns false when the slide ceiling is reached, meaning
     * the reader should stop walking the deck entirely.
     */
    startSlide(part: string, index: number): boolean;
    /**
     * Offer one block for the current slide. Returns false once this slide's text
     * budget is spent: later blocks on THIS slide are dropped, other slides are
     * unaffected.
     */
    push(block: SlideBlock): boolean;
    /** Offer one picture. Returns false to skip it (and says why, once). */
    takeImage(image: PptxImage): boolean;
    /**
     * Record a picture that was never read at all (its declared size already
     * exceeded the ceiling, so inflating it would be wasted work).
     */
    skipImage(reason: BreakerReason, detail: BreakerWarning['detail']): void;
    /** Mark the run BLOCKED (nothing usable will be produced). */
    block(reason: BreakerReason, detail: BreakerWarning['detail']): void;
    /** Mark the run TRUNCATED (usable, but incomplete). */
    warn(reason: BreakerReason, detail: BreakerWarning['detail']): void;
    /** Close the run and hand back the renderable result. */
    finalize(): PptxResult;
    state(): BreakerState;
}
/** Build one breaker run. */
export declare function createBreaker(config?: Partial<PptxConfig>): PptxBreaker;
/** A BLOCKED result with no content — the one shape every failure path returns. */
export declare function blockedResult(fileName: string, fileSize: number, config: Partial<PptxConfig>, reason: BreakerReason, detail: BreakerWarning['detail']): PptxResult;
