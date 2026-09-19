const LOCAL_SEED_PHOTOS: Record<string, string> = {
  'Mineral Water 1.5L': '/products/mineral-water.jpg',
  'Cola Can 33cl': '/products/cola-can.jpg',
  'Parboiled Rice 25kg': '/products/rice-sack.jpg',
}

/** Hosts/patterns used for dummy product images — never show on the register wall. */
const PLACEHOLDER_PHOTO_PATTERN =
  /placehold\.co|placeholder\.com|via\.placeholder|dummyimage\.com|placekitten|fakeimg\.pl|loremflickr|picsum\.photos/i

/** How product images are rendered in POS/inventory (see ProductPhotoFrame). */
export const PRODUCT_PHOTO_DISPLAY = {
  fit: 'contain' as const,
  hint: 'Center the product on a plain background; the app shows the full image without cropping.',
}

function trimUrl(photoUrl: string | null | undefined): string {
  return (photoUrl ?? '').trim()
}

export function isPlaceholderPhotoUrl(photoUrl: string | null | undefined): boolean {
  const url = trimUrl(photoUrl)
  if (!url) return true
  if (PLACEHOLDER_PHOTO_PATTERN.test(url)) return true
  // Seed fallback 1×1 / missing tile — treat as no real photo
  if (/\/_missing\.png(?:\?|$)/i.test(url) || /\/products\/eyo\/_missing/i.test(url)) {
    return true
  }
  return false
}

function isAllowedPhotoUrl(url: string): boolean {
  if (url.startsWith('/')) return true
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Prefer bundled seed photos over placeholder hosts so the POS product
 * wall can be visually tested without depending on an external CDN.
 */
export function resolveProductPhotoUrl(
  photoUrl: string | null | undefined,
  productName?: string | null,
): string {
  if (productName && LOCAL_SEED_PHOTOS[productName]) {
    return LOCAL_SEED_PHOTOS[productName]
  }
  const url = trimUrl(photoUrl)
  if (!url || isPlaceholderPhotoUrl(url)) {
    return ''
  }
  if (!isAllowedPhotoUrl(url)) {
    return ''
  }
  return url
}

/** True when the product can show a real image on the POS wall (before load verification). */
export function hasDisplayableProductPhoto(
  photoUrl: string | null | undefined,
  productName?: string | null,
): boolean {
  return resolveProductPhotoUrl(photoUrl, productName) !== ''
}

/**
 * POS catalog: keep every product. Cards render a serial fallback when the
 * photo URL is missing, a known placeholder host, or fails to load.
 * (Hiding on broken photos caused products to flash then vanish.)
 */
export function filterProductsForPosWall<
  T extends { photo_url: string; name: string },
>(products: T[]): T[] {
  return products
}
