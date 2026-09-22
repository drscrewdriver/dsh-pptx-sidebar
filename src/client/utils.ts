/** Small presentation helpers. Pure — no DOM, no React. */
export { formatBytes as formatSize } from './circuit-breaker'

/** Basename of a path, tolerating both separators. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}
