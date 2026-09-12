import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility for composing Tailwind class names safely.
 * Merges clsx conditions and resolves Tailwind conflicts (e.g. p-2 + p-4 → p-4).
 *
 * @example
 * cn('px-4 py-2', isActive && 'bg-primary text-white', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
