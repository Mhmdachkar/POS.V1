import * as Dialog from '@radix-ui/react-dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
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
  title: string
  /** Visually hidden description for screen readers when no visible description exists */
  description?: string
  children: React.ReactNode
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
            'w-full bg-surface rounded-xl shadow-lg border border-border',
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
          <div className="flex items-start justify-between p-5 border-b border-border">
            <Dialog.Title className="text-base font-semibold text-text-primary leading-snug">
              {title}
            </Dialog.Title>
            {!hideClose && (
              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-4 flex-shrink-0 -mr-1 -mt-1"
                  aria-label="Close"
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
                {title} dialog
              </Dialog.Description>
            </VisuallyHidden.Root>
          )}
          {description && (
            <Dialog.Description className="sr-only">{description}</Dialog.Description>
          )}

          {/* Body */}
          <div className="p-5">{children}</div>
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
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" hideClose>
      <div className="space-y-5">
        <p className="text-sm text-text-secondary">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// Drawer — right-side panel for detail views
// ─────────────────────────────────────────────────────────────────

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  width?: 'sm' | 'md' | 'lg'
}

const drawerWidths = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
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
            'duration-200',
            drawerWidths[width],
            'flex flex-col',
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
                  <Dialog.Description>{title} panel</Dialog.Description>
                </VisuallyHidden.Root>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close" className="flex-shrink-0">
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
