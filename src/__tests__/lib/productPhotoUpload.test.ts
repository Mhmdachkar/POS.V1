import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  PRODUCT_PHOTO_BUCKET,
  ProductPhotoUploadError,
  prepareProductPhotoForUpload,
  uploadProductPhoto,
  validateProductPhotoFile,
} from '@/lib/productPhotoUpload'

describe('productPhotoUpload', () => {
  const upload = vi.fn()
  const getPublicUrl = vi.fn()

  beforeEach(() => {
    upload.mockReset()
    getPublicUrl.mockReset()
    upload.mockResolvedValue({ data: { path: 'photo.jpg' }, error: null })
    getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://cdn.example.com/product-photos/photo.jpg' },
    })
    vi.mocked(supabase.storage.from).mockReturnValue({ upload, getPublicUrl } as never)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-1111-1111-111111111111')
  })

  it('rejects non-image files, empty files, and oversized files', () => {
    expect(validateProductPhotoFile(new File(['x'], 'notes.pdf', { type: 'application/pdf' }))).toMatch(
      /JPEG, PNG, or WebP/i,
    )
    expect(validateProductPhotoFile(new File([], 'empty.jpg', { type: 'image/jpeg' }))).toMatch(/empty/i)
    const oversized = new File(['x'], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(oversized, 'size', { value: 5 * 1024 * 1024 + 1 })
    expect(validateProductPhotoFile(oversized)).toMatch(/5 MB/i)
    expect(validateProductPhotoFile(new File(['ok'], 'cola.jpg', { type: 'image/jpeg' }))).toBeNull()
  })

  it('does not compress small photos before upload', async () => {
    const file = new File(['img'], 'cola.jpg', { type: 'image/jpeg' })
    await expect(prepareProductPhotoForUpload(file)).resolves.toBe(file)
  })

  it('uploads the device file to storage and returns the public URL', async () => {
    const file = new File(['img'], 'cola.jpg', { type: 'image/jpeg' })
    await expect(uploadProductPhoto(file)).resolves.toBe(
      'https://cdn.example.com/product-photos/photo.jpg',
    )
    expect(supabase.storage.from).toHaveBeenCalledWith(PRODUCT_PHOTO_BUCKET)
    expect(upload).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111.jpg',
      expect.any(File),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    )
  })

  it('throws a friendly error when storage rejects the upload', async () => {
    upload.mockResolvedValue({ data: null, error: { message: 'row-level security' } })
    await expect(
      uploadProductPhoto(new File(['img'], 'cola.jpg', { type: 'image/jpeg' })),
    ).rejects.toBeInstanceOf(ProductPhotoUploadError)
  })
})
