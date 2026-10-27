/** Unwrap PostgREST embeds that may be an object or a one-element array. */
export function embedOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}
