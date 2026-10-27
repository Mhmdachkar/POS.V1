import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { COMMON } from '@/lib/bilingual/common'
import { t } from '@/lib/bilingual/types'
import { Button } from './Button'

// ─────────────────────────────────────────────────────────────────
// Modal (Dialog)
// ─────────────────────────────────────────────────────────────────

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
} as const

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** Visually hidden description for screen readers when no visible description exists */
  description?: ReactNode
  children: React.ReactNode
  /** Pinned below the scrollable body so actions stay visible */
  footer?: React.ReactNode
  size?: keyof typeof sizeClasses
  /** Hide the close button */
  hideClose?: boolean
  className?: string
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideClose = false,
  className,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        {/* Overlay */}
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />

        {/* Content */}
        <Dialog.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
            'flex max-h-[min(92dvh,56rem)] w-[calc(100%-1.5rem)] flex-col overflow-hidden',
            'bg-surface rounded-xl shadow-lg border border-border',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
            sizeClasses[size],
            className,
          )}
          aria-describedby={description ? undefined : 'modal-desc'}
        >
          {/* Header */}
          <div className="flex flex-shrink-0 items-start justify-between p-5 border-b border-border">
            <Dialog.Title className="text-base font-semibold text-text-primary leading-snug">
              {title}
            </Dialog.Title>
            {!hideClose && (
              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-4 flex-shrink-0 -mr-1 -mt-1"
                  aria-label={t(COMMON.close)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            )}
          </div>

          {/* Hidden description for screen readers if not provided visually */}
          {!description && (
            <VisuallyHidden.Root>
              <Dialog.Description id="modal-desc">
                {title}
              </Dialog.Description>
            </VisuallyHidden.Root>
          )}
          {description && (
            <Dialog.Description asChild>
              <div className="sr-only">{description}</div>
            </Dialog.Description>
          )}

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">{children}</div>
          {footer && (
            <div className="flex-shrink-0 border-t border-border bg-surface px-5 py-4 flex items-center justify-end gap-3 [&>button]:min-h-[44px]">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─────────────────────────────────────────────────────────────────
// ConfirmDialog — destructive action confirmation
// ─────────────────────────────────────────────────────────────────

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: ReactNode
  message: ReactNode
  confirmLabel?: ReactNode
  cancelLabel?: ReactNode
  variant?: 'danger' | 'primary'
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      hideClose
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {cancelLabel ?? t(COMMON.cancel)}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? t(COMMON.processing) : (confirmLabel ?? t(COMMON.confirm))}
          </Button>
        </>
      }
    >
      <div className="text-sm text-text-secondary">{message}</div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// Drawer — right-side panel for detail views
// ─────────────────────────────────────────────────────────────────

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: React.ReactNode
  width?: 'sm' | 'md' | 'lg'
}

const drawerWidths = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  width = 'md',
}: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/30',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed right-0 top-0 z-50 h-full w-full bg-surface shadow-lg border-l border-border',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'duration-200 flex flex-col',
            drawerWidths[width],
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-border flex-shrink-0">
            <div>
              <Dialog.Title className="text-base font-semibold text-text-primary">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-sm text-text-secondary mt-0.5">
                  {description}
                </Dialog.Description>
              )}
              {!description && (
                <VisuallyHidden.Root>
                  <Dialog.Description>{title}</Dialog.Description>
                </VisuallyHidden.Root>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t(COMMON.close)} className="flex-shrink-0 min-h-[44px] min-w-[44px]">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
