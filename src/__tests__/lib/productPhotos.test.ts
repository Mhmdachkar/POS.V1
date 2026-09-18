import { describe, it, expect } from 'vitest'
import {
  filterProductsForPosWall,
  hasDisplayableProductPhoto,
  isPlaceholderPhotoUrl,
  resolveProductPhotoUrl,
} from '@/lib/productPhotos'

describe('productPhotos', () => {
  it('maps seed product names to local assets', () => {
    expect(resolveProductPhotoUrl('', 'Cola Can 33cl')).toBe('/products/cola-can.jpg')
  })

  it('rejects empty and placeholder hosts', () => {
    expect(resolveProductPhotoUrl('', 'Unknown')).toBe('')
    expect(resolveProductPhotoUrl('https://placehold.co/400x300', 'Unknown')).toBe('')
    expect(isPlaceholderPhotoUrl('https://via.placeholder.com/150')).toBe(true)
  })

  it('accepts https and local paths', () => {
    expect(resolveProductPhotoUrl('https://cdn.example.com/a.jpg', 'X')).toBe(
      'https://cdn.example.com/a.jpg',
    )
    expect(resolveProductPhotoUrl('/products/x.jpg', 'X')).toBe('/products/x.jpg')
  })

  it('filters POS wall products without displayable photos', () => {
    const rows = filterProductsForPosWall([
      { id: '1', name: 'Placeholder SKU', photo_url: 'https://placehold.co/x' },
      { id: '2', name: 'Empty SKU', photo_url: '' },
      { id: '3', name: 'Other', photo_url: 'https://images.example.com/p.jpg' },
    ])
    expect(rows.map((r) => r.id)).toEqual(['3'])
    expect(hasDisplayableProductPhoto('https://placehold.co/x')).toBe(false)
  })
})
