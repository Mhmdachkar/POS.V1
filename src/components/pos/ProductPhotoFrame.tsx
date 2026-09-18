import { cn } from '@/lib/cn'

export interface ProductPhotoFrameProps {
  src: string
  onError?: () => void
  alt?: string
  className?: string
  /** Subtle zoom on card hover (POS grid) */
  interactive?: boolean
}

/**
 * Product tile image — fills the card width, scales up with object-contain
 * (full product visible, no crop). Square aspect works best on the POS wall.
 */
export function ProductPhotoFrame({
  src,
  onError,
  alt = '',
  className,
  interactive = false,
}: ProductPhotoFrameProps) {
  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden bg-surface-muted',
        className,
      )}
    >
      <div className="absolute inset-0 p-0.5">
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={onError}
          className={cn(
            'product-photo-contain',
            interactive &&
              'transition-transform duration-500 ease-out group-hover/card:scale-[1.03]',
          )}
        />
      </div>
    </div>
  )
}
