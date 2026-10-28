import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProductFormModal } from '@/pages/inventory/components/ProductFormModal'
import { useCreateProduct, useUpdateProduct } from '@/hooks/useAdminProducts'
import { useCategories } from '@/hooks/useInventory'
import { uploadProductPhoto } from '@/lib/productPhotoUpload'
import { toast } from 'sonner'
import type { ProductWithUnits } from '@/types'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { expectToastSuccessFr, getByFrench } from '../helpers/bilingualQueries'

const categoryLabel = /catégorie|category/i
const subcategoryLabel = /sous-catégorie|subcategory/i

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

function productNameInput() {
  return document.getElementById('product-name') as HTMLInputElement
}

function unitCostInput(level = 0) {
  return document.getElementById(`unit-${level}-cost`) as HTMLInputElement
}

function unitPriceInput(level = 0) {
  return document.getElementById(`unit-${level}-price`) as HTMLInputElement
}

function unitSerialInput(level = 0) {
  return document.getElementById(`unit-${level}-serial`) as HTMLInputElement
}

function photoFileInput() {
  return document.getElementById('product-photo') as HTMLInputElement
}

describe('ProductFormModal low-stock settings', () => {
  const createProduct = vi.fn()
  const updateProduct = vi.fn()
  const photoFile = new File(['img'], 'onion.jpg', { type: 'image/jpeg' })

  function choosePhoto() {
    fireEvent.change(photoFileInput(), {
      target: { files: [photoFile] },
    })
  }

  async function fillBaseCreateFields(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.type(productNameInput(), name)
    await user.selectOptions(screen.getByLabelText(categoryLabel), 'cat-food')
    choosePhoto()
    await user.type(unitSerialInput(0), 'ON-PCE-001')
    await user.type(unitCostInput(0), '100')
    await user.type(unitPriceInput(0), '150')
  }

  beforeEach(() => {
    createProduct.mockReset()
    updateProduct.mockReset()
    vi.mocked(uploadProductPhoto).mockReset()
    vi.mocked(uploadProductPhoto).mockResolvedValue('https://cdn.example.com/uploaded-onion.jpg')
    vi.mocked(useCreateProduct).mockReturnValue({
      mutateAsync: createProduct,
      isPending: false,
    } as never)
    vi.mocked(useUpdateProduct).mockReturnValue({
      mutateAsync: updateProduct,
      isPending: false,
    } as never)
    vi.mocked(toast.success).mockReset()
    vi.mocked(useCategories).mockReturnValue({
      data: [
        { id: 'cat-food', parent_id: null, name: 'Food', is_active: true, created_at: '2026-01-01T00:00:00Z' },
      ],
      isLoading: false,
    } as never)
  })

  it('hides the threshold until tracking is enabled', async () => {
    const user = userEvent.setup()
    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" />)

    expect(screen.getByText('Produit')).toBeInTheDocument()
    expect(getByFrench(INVENTORY.unitsAndPricing.fr)).toBeInTheDocument()
    expect(screen.getAllByText(INVENTORY.monitoringSection.fr, { exact: true })[0]).toBeInTheDocument()
    expect(screen.getAllByText(INVENTORY.trackLowStock.fr)[0]).toBeInTheDocument()
    expect(screen.queryByLabelText(/Min\. stock|Stock minimum/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Low-stock alert|Alerte stock faible/i }))
    expect(screen.getByLabelText(/Min\. stock|Stock minimum/i)).toHaveValue(10)
  })

  it('shows Taux de marge next to cost/sell ((sell−cost)/cost)', async () => {
    const user = userEvent.setup()
    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" />)

    const rateEl = screen.getByTestId('unit-0-margin-rate')
    expect(rateEl).toHaveTextContent(INVENTORY.marginRate.fr)
    expect(rateEl).toHaveTextContent(INVENTORY.unavailableMargin.fr)

    await user.type(unitCostInput(0), '100')
    await user.type(unitPriceInput(0), '135')
    expect(screen.getByTestId('unit-0-margin-rate')).toHaveTextContent('35 %')
  })

  it('sends tracking fields on create', async () => {
    const user = userEvent.setup()
    createProduct.mockResolvedValue({})
    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" />)

    await fillBaseCreateFields(user, 'Onion')
    await user.click(screen.getByRole('checkbox', { name: /Low-stock alert|Alerte stock faible/i }))
    await user.clear(screen.getByLabelText(/Min\. stock|Stock minimum/i))
    await user.type(screen.getByLabelText(/Min\. stock|Stock minimum/i), '10')
    await user.click(screen.getByRole('button', { name: /Create Product|Créer le produit/i }))

    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        p_name: 'Onion',
        p_photo_url: 'https://cdn.example.com/uploaded-onion.jpg',
        p_track_low_stock: true,
        p_low_stock_threshold: 10,
        p_units: [
          expect.objectContaining({
            unit_level: 0,
            serial_number: 'ON-PCE-001',
            cost_price_cfa: 100,
            selling_price_cfa: 150,
          }),
        ],
      }),
    )
    expect(uploadProductPhoto).toHaveBeenCalledWith(photoFile)
    expectToastSuccessFr(toast.success, INVENTORY.productCreated.fr)
  })

  it('keeps Cancel and Create pinned and groups thousands in money fields', async () => {
    const user = userEvent.setup()
    createProduct.mockResolvedValue({})
    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" />)

    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toMatch(/max-h-\[min\(92dvh,56rem\)\]/)
    expect(dialog.className).toMatch(/overflow-hidden/)
    expect(screen.getByRole('button', { name: /Cancel|Annuler/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /Create Product|Créer le produit/i })).toBeVisible()
    expect(photoFileInput()).toHaveAttribute('type', 'file')
    expect(screen.getByRole('button', { name: /Choose photo|Choisir une photo/i })).toHaveClass(
      'hover:bg-primary-hover',
    )
    expect(screen.queryByPlaceholderText('https://…')).not.toBeInTheDocument()
    expect(screen.queryByText('Photo URL')).not.toBeInTheDocument()

    await user.type(productNameInput(), 'Onion')
    await user.selectOptions(screen.getByLabelText(categoryLabel), 'cat-food')
    choosePhoto()
    await user.type(unitSerialInput(0), 'ON-PCE-001')

    const cost = unitCostInput(0)
    const selling = unitPriceInput(0)
    fireEvent.change(cost, { target: { value: '40000' } })
    fireEvent.change(selling, { target: { value: '60000' } })
    expect(cost).toHaveValue('40 000')
    expect(selling).toHaveValue('60 000')

    await user.click(screen.getByRole('button', { name: /Create Product|Créer le produit/i }))
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        p_units: [
          expect.objectContaining({
            serial_number: 'ON-PCE-001',
            cost_price_cfa: 40000,
            selling_price_cfa: 60000,
          }),
        ],
      }),
    )
  })

  it('shows grouped cost and price when editing', () => {
    const product: ProductWithUnits = {
      id: 'prod-bleach',
      depot_id: 'depot-a',
      category_id: 'cat-food',
      name: 'Household Bleach 1L',
      photo_url: 'https://cdn.example.com/bleach.jpg',
      current_stock_pieces: 10,
      track_low_stock: false,
      low_stock_threshold: null,
      is_active: true,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      units: [
        {
          id: 'u1',
          product_id: 'prod-bleach',
          unit_level: 0,
          unit_name: 'Bottle',
          serial_number: 'BL-PCE-001',
          conversion_to_base: 1,
          relative_quantity: null,
          cost_price_cfa: 40000,
          selling_price_cfa: 60000,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
      ],
    }

    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" product={product} />)

    expect(unitCostInput(0)).toHaveValue('40 000')
    expect(unitPriceInput(0)).toHaveValue('60 000')
    expect(unitSerialInput(0)).toHaveValue('BL-PCE-001')
    expect(screen.getByRole('button', { name: /Save Changes|Enregistrer/i })).toBeVisible()
    expect(screen.getByRole('img', { name: /Aperçu photo produit|Product photo/i })).toHaveAttribute(
      'src',
      'https://cdn.example.com/bleach.jpg',
    )
  })

  it('keeps the existing photo on edit unless a new device file is chosen', async () => {
    const user = userEvent.setup()
    updateProduct.mockResolvedValue({})
    const product: ProductWithUnits = {
      id: 'prod-bleach',
      depot_id: 'depot-a',
      category_id: 'cat-food',
      name: 'Household Bleach 1L',
      photo_url: 'https://cdn.example.com/bleach.jpg',
      current_stock_pieces: 10,
      track_low_stock: false,
      low_stock_threshold: null,
      is_active: true,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      units: [
        {
          id: 'u1',
          product_id: 'prod-bleach',
          unit_level: 0,
          unit_name: 'Bottle',
          serial_number: 'BL-PCE-001',
          conversion_to_base: 1,
          relative_quantity: null,
          cost_price_cfa: 40000,
          selling_price_cfa: 60000,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
      ],
    }

    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" product={product} />)
    await user.click(screen.getByRole('button', { name: /Save Changes|Enregistrer/i }))

    expect(uploadProductPhoto).not.toHaveBeenCalled()
    expect(updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        p_product_id: 'prod-bleach',
        p_photo_url: 'https://cdn.example.com/bleach.jpg',
        p_units: [
          expect.objectContaining({
            unit_level: 0,
            serial_number: 'BL-PCE-001',
          }),
        ],
      }),
    )
  })

  it('walks category then subcategory when creating a product', async () => {
    const user = userEvent.setup()
    createProduct.mockResolvedValue({})
    vi.mocked(useCategories).mockReturnValue({
      data: [
        { id: 'bev', parent_id: null, name: 'Beverages', is_active: true, created_at: '2026-01-01T00:00:00Z' },
        { id: 'soft', parent_id: 'bev', name: 'Soft Drinks', is_active: true, created_at: '2026-01-01T00:00:00Z' },
      ],
      isLoading: false,
    } as never)

    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" />)

    await user.type(productNameInput(), 'Cola')
    await user.selectOptions(screen.getByLabelText(categoryLabel), 'bev')
    await user.selectOptions(screen.getByLabelText(subcategoryLabel), 'soft')
    choosePhoto()
    await user.type(unitSerialInput(0), 'CO-PCE-001')
    await user.type(unitCostInput(0), '100')
    await user.type(unitPriceInput(0), '150')
    await user.click(screen.getByRole('button', { name: /Create Product|Créer le produit/i }))

    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        p_name: 'Cola',
        p_category_id: 'soft',
        p_units: [
          expect.objectContaining({
            serial_number: 'CO-PCE-001',
          }),
        ],
      }),
    )
  })

  it('keeps level 0 locked and requires serial when enabling carton', async () => {
    const user = userEvent.setup()
    createProduct.mockResolvedValue({})
    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" />)

    const piece = document.getElementById('unit-0-enabled') as HTMLInputElement
    const packageToggle = document.getElementById('unit-1-enabled') as HTMLInputElement
    const carton = document.getElementById('unit-2-enabled') as HTMLInputElement
    expect(piece).toBeDisabled()
    expect(piece).toBeChecked()
    expect(carton).toBeEnabled()

    await user.click(carton)
    expect(packageToggle).toBeChecked()
    expect(carton).toBeChecked()

    await user.type(productNameInput(), 'Rice sack')
    await user.selectOptions(screen.getByLabelText(categoryLabel), 'cat-food')
    choosePhoto()
    await user.type(unitSerialInput(0), 'RI-PCE-001')
    await user.type(unitCostInput(0), '500')
    await user.type(unitPriceInput(0), '700')
    await user.type(unitSerialInput(1), 'RI-PKG-001')
    await user.type(document.getElementById('unit-1-rel') as HTMLInputElement, '12')
    await user.type(unitCostInput(1), '6000')
    await user.type(unitPriceInput(1), '8400')
    await user.type(unitSerialInput(2), 'RI-CTN-001')
    await user.type(document.getElementById('unit-2-rel') as HTMLInputElement, '2')
    await user.type(unitCostInput(2), '12000')
    await user.type(unitPriceInput(2), '16800')
    await user.click(screen.getByRole('button', { name: /Create Product|Créer le produit/i }))

    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        p_name: 'Rice sack',
        p_units: expect.arrayContaining([
          expect.objectContaining({
            unit_level: 0,
            serial_number: 'RI-PCE-001',
            relative_quantity: null,
          }),
          expect.objectContaining({
            unit_level: 1,
            serial_number: 'RI-PKG-001',
            relative_quantity: 12,
          }),
          expect.objectContaining({
            unit_level: 2,
            serial_number: 'RI-CTN-001',
            relative_quantity: 2,
          }),
        ]),
      }),
    )
    expect(createProduct.mock.calls[0][0].p_units).toHaveLength(3)
  })

  it('blocks create when serial number is missing', async () => {
    const user = userEvent.setup()
    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" />)

    await user.type(productNameInput(), 'Rice sack')
    await user.selectOptions(screen.getByLabelText(categoryLabel), 'cat-food')
    choosePhoto()
    await user.type(unitCostInput(0), '100')
    await user.type(unitPriceInput(0), '150')
    await user.click(screen.getByRole('button', { name: /Create Product|Créer le produit/i }))

    expect(createProduct).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('keeps level 0 enabled on edit and saves serial hierarchy', async () => {
    const user = userEvent.setup()
    updateProduct.mockResolvedValue({})
    const product: ProductWithUnits = {
      id: 'prod-rice',
      depot_id: 'depot-a',
      category_id: 'cat-food',
      name: 'Rice sack',
      photo_url: 'https://cdn.example.com/rice.jpg',
      current_stock_pieces: 4,
      track_low_stock: false,
      low_stock_threshold: null,
      is_active: true,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      units: [
        {
          id: 'u0',
          product_id: 'prod-rice',
          unit_level: 0,
          unit_name: 'Piece',
          serial_number: 'RI-PCE-001',
          conversion_to_base: 1,
          relative_quantity: null,
          cost_price_cfa: 500,
          selling_price_cfa: 700,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
        {
          id: 'u2',
          product_id: 'prod-rice',
          unit_level: 2,
          unit_name: 'Carton',
          serial_number: 'RI-CTN-001',
          conversion_to_base: 24,
          relative_quantity: 2,
          cost_price_cfa: 10000,
          selling_price_cfa: 14000,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
      ],
    }

    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" product={product} />)

    const piece = document.getElementById('unit-0-enabled') as HTMLInputElement
    expect(piece).toBeDisabled()
    expect(piece).toBeChecked()

    // L2 without L1 relative data — enable package and fill required hierarchy fields
    const packageToggle = document.getElementById('unit-1-enabled') as HTMLInputElement
    if (!packageToggle.checked) {
      await user.click(packageToggle)
    }
    await user.clear(unitSerialInput(1))
    await user.type(unitSerialInput(1), 'RI-PKG-001')
    const rel1 = document.getElementById('unit-1-rel') as HTMLInputElement
    await user.clear(rel1)
    await user.type(rel1, '12')
    await user.clear(unitCostInput(1))
    await user.type(unitCostInput(1), '6000')
    await user.clear(unitPriceInput(1))
    await user.type(unitPriceInput(1), '8400')

    await user.click(screen.getByRole('button', { name: /Save Changes|Enregistrer/i }))

    expect(updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        p_product_id: 'prod-rice',
        p_units: expect.arrayContaining([
          expect.objectContaining({
            unit_level: 0,
            serial_number: 'RI-PCE-001',
          }),
          expect.objectContaining({
            unit_level: 2,
            serial_number: 'RI-CTN-001',
            relative_quantity: 2,
          }),
        ]),
      }),
    )
  })

  it('B5: negative selling price shows an error instead of being stripped', async () => {
    const user = userEvent.setup()
    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" />)
    await fillBaseCreateFields(user, 'Onion')
    fireEvent.change(unitPriceInput(0), { target: { value: '-50' } })
    expect(unitPriceInput(0)).toHaveValue('-50')
    expect(screen.getByText(INVENTORY.negativePriceError.fr)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Create Product|Créer le produit/i }))
    expect(createProduct).not.toHaveBeenCalled()
  })

  it('B5: sell below cost warns but still creates the product', async () => {
    const user = userEvent.setup()
    createProduct.mockResolvedValue({})
    wrap(<ProductFormModal open onClose={() => undefined} depotId="depot-a" />)
    await fillBaseCreateFields(user, 'Onion')
    fireEvent.change(unitPriceInput(0), { target: { value: '50' } })
    expect(screen.getByText(INVENTORY.sellBelowCostWarning.fr)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Create Product|Créer le produit/i }))
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        p_units: [
          expect.objectContaining({
            cost_price_cfa: 100,
            selling_price_cfa: 50,
          }),
        ],
      }),
    )
  })
})
