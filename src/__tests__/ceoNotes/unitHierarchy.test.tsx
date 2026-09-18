/**
 * CEO Notes — Unit hierarchy: relative_quantity, derived conversion, no client conversion_to_base.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProductFormModal } from '@/pages/inventory/components/ProductFormModal'
import { useCreateProduct, useUpdateProduct } from '@/hooks/useAdminProducts'
import { useCategories } from '@/hooks/useInventory'
import { uploadProductPhoto } from '@/lib/productPhotoUpload'
import { INVENTORY } from '@/lib/bilingual/inventory'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/hooks/useAdminProducts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAdminProducts')>()
  return {
    ...actual,
    useCreateProduct: vi.fn(),
    useUpdateProduct: vi.fn(),
  }
})

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInventory')>()
  return {
    ...actual,
    useCategories: vi.fn(),
  }
})

vi.mock('@/lib/productPhotoUpload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/productPhotoUpload')>()
  return {
    ...actual,
    uploadProductPhoto: vi.fn(),
  }
})

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('CEO Notes — unit hierarchy (ProductFormModal)', () => {
  const createProduct = vi.fn()
  const updateProduct = vi.fn()
  const photoFile = new File(['img'], 'onion.jpg', { type: 'image/jpeg' })

  function choosePhoto() {
    fireEvent.change(screen.getByLabelText(/photo du produit|product photo/i), {
      target: { files: [photoFile] },
    })
  }

  beforeEach(() => {
    createProduct.mockReset()
    updateProduct.mockReset()
    vi.mocked(uploadProductPhoto).mockReset()
    vi.mocked(uploadProductPhoto).mockResolvedValue('https://cdn.example.com/onion.jpg')
    vi.mocked(useCreateProduct).mockReturnValue({
      mutateAsync: createProduct,
      isPending: false,
    } as never)
    vi.mocked(useUpdateProduct).mockReturnValue({
      mutateAsync: updateProduct,
      isPending: false,
    } as never)
    vi.mocked(useCategories).mockReturnValue({
      data: [
        { id: 'cat-food', parent_id: null, name: 'Food', is_active: true, created_at: '2026-01-01T00:00:00Z' },
      ],
      isLoading: false,
    } as never)
  })

  it('keeps L0 conversion fixed at 1 (no relative_quantity input)', () => {
    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" />)
    expect(screen.queryByLabelText(new RegExp(INVENTORY.piecesPerPackage.fr, 'i'))).not.toBeInTheDocument()
    expect(screen.queryByLabelText(new RegExp(INVENTORY.packagesPerCarton.fr, 'i'))).not.toBeInTheDocument()
    // L0 always enabled / cannot be toggled off
    const l0 = document.getElementById('unit-0-enabled') as HTMLInputElement
    expect(l0).toBeChecked()
    expect(l0).toBeDisabled()
  })

  it('shows relative_quantity for L1 and L2 and derives carton conversion 50×12=600', async () => {
    const user = userEvent.setup()
    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" />)

    await user.click(document.getElementById('unit-1-enabled')!)
    await user.click(document.getElementById('unit-2-enabled')!)

    expect(screen.getByLabelText(new RegExp(INVENTORY.piecesPerPackage.fr, 'i'))).toBeInTheDocument()
    expect(screen.getByLabelText(new RegExp(INVENTORY.packagesPerCarton.fr, 'i'))).toBeInTheDocument()

    await user.type(screen.getByLabelText(new RegExp(INVENTORY.piecesPerPackage.fr, 'i')), '12')
    await user.type(screen.getByLabelText(new RegExp(INVENTORY.packagesPerCarton.fr, 'i')), '50')

    expect(screen.getByText(INVENTORY.derivedHierarchy.fr)).toBeInTheDocument()
    // 1 Carton = 50 Paquets = 600 pièces
    expect(screen.getByText('600')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('create payload sends relative_quantity and never conversion_to_base', async () => {
    const user = userEvent.setup()
    createProduct.mockResolvedValue({})
    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" />)

    await user.type(document.getElementById('product-name')!, 'Onion')
    await user.selectOptions(screen.getByLabelText(/catégorie|category/i), 'cat-food')
    choosePhoto()

    await user.type(document.getElementById('unit-0-serial')!, 'ON-PCE-001')
    await user.type(document.getElementById('unit-0-cost')!, '100')
    await user.type(document.getElementById('unit-0-price')!, '150')

    await user.click(document.getElementById('unit-1-enabled')!)
    await user.type(document.getElementById('unit-1-serial')!, 'ON-PKG-001')
    await user.type(screen.getByLabelText(new RegExp(INVENTORY.piecesPerPackage.fr, 'i')), '12')
    await user.type(document.getElementById('unit-1-cost')!, '1100')
    await user.type(document.getElementById('unit-1-price')!, '1500')

    await user.click(document.getElementById('unit-2-enabled')!)
    await user.type(document.getElementById('unit-2-serial')!, 'ON-CTN-001')
    await user.type(screen.getByLabelText(new RegExp(INVENTORY.packagesPerCarton.fr, 'i')), '50')
    await user.type(document.getElementById('unit-2-cost')!, '50000')
    await user.type(document.getElementById('unit-2-price')!, '70000')

    await user.click(screen.getByRole('button', { name: /Create Product|Créer le produit/i }))

    expect(createProduct).toHaveBeenCalledTimes(1)
    const args = createProduct.mock.calls[0][0]
    expect(args.p_units).toEqual([
      expect.objectContaining({
        unit_level: 0,
        serial_number: 'ON-PCE-001',
        relative_quantity: null,
      }),
      expect.objectContaining({
        unit_level: 1,
        serial_number: 'ON-PKG-001',
        relative_quantity: 12,
      }),
      expect.objectContaining({
        unit_level: 2,
        serial_number: 'ON-CTN-001',
        relative_quantity: 50,
      }),
    ])
    for (const unit of args.p_units) {
      expect(unit).not.toHaveProperty('conversion_to_base')
    }
  })
})
