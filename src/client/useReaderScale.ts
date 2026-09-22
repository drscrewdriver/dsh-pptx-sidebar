/**
 * The one piece of DOM glue behind `scale.ts`.
 *
 * A callback ref, not a `useRef` + `useEffect` pair: the viewer renders three
 * different roots (loading, error, ready), and React calls a callback ref with
 * `null` then with the new node when it swaps them. That is exactly the moment
 * the observer has to be re-pointed, and it is easy to get wrong the other way.
 *
 * The scale is written to a CSS custom property rather than to React state:
 * re-rendering the whole document tree on every step of a drag would be real
 * work for no visible gain, while a custom property only invalidates style.
 */
import { useCallback, useEffect, useRef } from 'react'
import { SCALE_VAR, readerScaleFor, quantizeScale } from './scale'

/** Attach to the reading view's root element. */
export function useReaderScale<T extends HTMLElement>(): (node: T | null) => void {
  const observerRef = useRef<ResizeObserver | null>(null)
  /** Last value written, so a no-op resize does not touch the DOM. */
  const appliedRef = useRef<number | null>(null)

  // A callback ref is not called on unmount unless the node changes, so the
  // observer is also torn down here.
  useEffect(
    () => () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    },
    [],
  )

  return useCallback((node: T | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    appliedRef.current = null
    if (node === null) return

    const apply = (width: number): void => {
      const scale = quantizeScale(readerScaleFor(width))
      if (appliedRef.current === scale) return
      appliedRef.current = scale
      node.style.setProperty(SCALE_VAR, String(scale))
    }

    apply(node.clientWidth)

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry !== undefined) apply(entry.contentRect.width)
    })
    observer.observe(node)
    observerRef.current = observer
  }, [])
}
