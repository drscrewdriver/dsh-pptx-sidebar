import type { T } from './locales';
interface PptxViewerProps {
    path: string;
    title?: string;
    /** Raw archive bytes, from the registered `custom` loader. */
    customData?: unknown;
    t: T;
}
export declare function PptxViewer({ path, title, customData, t }: PptxViewerProps): import("react").JSX.Element;
export {};
