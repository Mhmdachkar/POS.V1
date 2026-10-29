import { useState } from 'react'
import { cn } from '@/lib/cn'
import { resolveProductPhotoUrl } from '@/lib/productPhotos'

export function ProductThumb({
  photoUrl,
  name,
  size = 'md',
}: {
  photoUrl: string | null | undefined
  name: string
  size?: 'sm' | 'md'
}) {
  const [failed, setFailed] = useState(false)
  const src = resolveProductPhotoUrl(photoUrl, name)
  const dim = size === 'sm' ? 'h-10 w-10' : 'h-12 w-12'
  if (!src || failed) {
    return (
      <span
        className={cn(dim, 'rounded-md bg-surface-muted flex-shrink-0 ring-1 ring-border/60')}
        aria-hidden
      />
    )
  }
  return (
    <img
      src={src}
      alt=""
      className={cn(dim, 'rounded-md object-cover flex-shrink-0 ring-1 ring-border/60')}
      onError={() => setFailed(true)}
    />
  )
}