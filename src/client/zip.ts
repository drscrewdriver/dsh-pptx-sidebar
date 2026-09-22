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
  name: string
  /** 0 = stored, 8 = deflate. */
  method: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50

/** Little-endian u32. */
function u32(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
}

/** Little-endian u16. */
function u16(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8)
}

/** Raised when inflation crosses a budget. */
export class BudgetExceeded extends Error {
  constructor(
    readonly bytes: number,
    readonly limit: number,
  ) {
    super(`inflated ${bytes} bytes, budget ${limit}`)
  }
}

/** Parse the central directory (its record sits near the tail, after any comment). */
export function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  const floor = Math.max(0, bytes.length - 66_000)
  let eocd = -1
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (u32(bytes, i) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip container (no end-of-central-directory record)')

  const count = u16(bytes, eocd + 10)
  let at = u32(bytes, eocd + 16)
  const entries: ZipEntry[] = []

  for (let i = 0; i < count; i++) {
    if (u32(bytes, at) !== CEN_SIG) throw new Error(`corrupt central directory at entry ${i}`)
    const nameLength = u16(bytes, at + 28)
    const extraLength = u16(bytes, at + 30)
    const commentLength = u16(bytes, at + 32)
    entries.push({
      name: new TextDecoder('utf-8').decode(bytes.subarray(at + 46, at + 46 + nameLength)),
      method: u16(bytes, at + 10),
      compressedSize: u32(bytes, at + 20),
      uncompressedSize: u32(bytes, at + 24),
      localHeaderOffset: u32(bytes, at + 42),
    })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** Concatenate inflate chunks. */
function join(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }
  return out
}

/**
 * Inflate one entry, aborting the moment `limit` is crossed.
 *
 * The limit is enforced on the *decoded* stream, so a lying header cannot buy
 * unbounded memory.
 */
export async function inflateEntry(bytes: Uint8Array, entry: ZipEntry, limit: number): Promise<Uint8Array> {
  const at = entry.localHeaderOffset
  if (u32(bytes, at) !== LOC_SIG) throw new Error(`corrupt local header for ${entry.name}`)
  // The local header's sizes may be zero (data descriptor), so only offsets and
  // the name/extra lengths are read from it.
  const payloadAt = at + 30 + u16(bytes, at + 26) + u16(bytes, at + 28)
  const payload = bytes.subarray(payloadAt, payloadAt + entry.compressedSize)

  if (entry.method === 0) {
    if (payload.byteLength > limit) throw new BudgetExceeded(payload.byteLength, limit)
    return payload.slice()
  }
  if (entry.method !== 8) throw new Error(`unsupported zip compression method ${entry.method} in ${entry.name}`)
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is unavailable in this runtime')
  }

  const stream = new Blob([payload as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value === undefined) continue
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      throw new BudgetExceeded(total, limit)
    }
    chunks.push(value)
  }
  return join(chunks, total)
}
