import { supabase } from '@/lib/supabase'

export const PRODUCT_PHOTO_BUCKET = 'product-photos'
export const PRODUCT_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'
export const PRODUCT_PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const PRODUCT_PHOTO_COMPRESS_ABOVE_BYTES = 350 * 1024
export const PRODUCT_PHOTO_MAX_EDGE = 1600

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export class ProductPhotoUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductPhotoUploadError'
  }
}

function extensionForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  throw new ProductPhotoUploadError('Choose a JPEG, PNG, or WebP photo from this device.')
}

export function validateProductPhotoFile(file: File): string | null {
  if (!ALLOWED_MIME.has(file.type)) {
    return 'Choose a JPEG, PNG, or WebP photo from this device.'
  }
  if (file.size <= 0) {
    return 'That photo file is empty. Choose another image.'
  }
  if (file.size > PRODUCT_PHOTO_MAX_BYTES) {
    return 'Photo must be 5 MB or smaller.'
  }
  return null
}

/**
 * Shrink large device photos before Storage upload. Falls back to the original
 * file when Canvas/ImageBitmap is unavailable (tests, unsupported browsers).
 */
export async function prepareProductPhotoForUpload(file: File): Promise<File> {
  if (file.size <= PRODUCT_PHOTO_COMPRESS_ABOVE_BYTES) return file
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return file
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, PRODUCT_PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((next) => resolve(next), 'image/jpeg', 0.82)
    })
    if (!blob || blob.size <= 0 || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export async function uploadProductPhoto(file: File): Promise<string> {
  const validation = validateProductPhotoFile(file)
  if (validation) {
    throw new ProductPhotoUploadError(validation)
  }

  const uploadFile = await prepareProductPhotoForUpload(file)
  const path = `${crypto.randomUUID()}.${extensionForMime(uploadFile.type)}`
  const { error } = await supabase.storage.from(PRODUCT_PHOTO_BUCKET).upload(path, uploadFile, {
    cacheControl: '3600',
    contentType: uploadFile.type,
    upsert: false,
  })
  if (error) {
    throw new ProductPhotoUploadError('Could not upload the photo. Try another image.')
  }

  const { data } = supabase.storage.from(PRODUCT_PHOTO_BUCKET).getPublicUrl(path)
  const publicUrl = data.publicUrl?.trim() ?? ''
  if (!publicUrl) {
    throw new ProductPhotoUploadError('Could not upload the photo. Try another image.')
  }
  return publicUrl
}
