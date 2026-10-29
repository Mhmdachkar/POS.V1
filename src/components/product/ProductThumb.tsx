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
  size?: 'sm' | 'md' | 'lg'
}) {
  const [failed, setFailed] = useState(false)
  const src = resolveProductPhotoUrl(photoUrl, name)
  const dim =
    size === 'lg' ? 'h-16 w-16' : size === 'sm' ? 'h-11 w-11' : 'h-14 w-14'
  if (!src || failed) {
    return (
      <span
        className={cn(
          dim,
          'rounded-md bg-surface-muted flex-shrink-0 ring-1 ring-border flex items-center justify-center text-[10px] text-text-muted',
        )}
        aria-hidden
      >
        —
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      className={cn(
        dim,
        'rounded-md object-contain bg-surface-muted flex-shrink-0 ring-1 ring-border p-0.5',
      )}
      onError={() => setFailed(true)}
    />
  )
}
