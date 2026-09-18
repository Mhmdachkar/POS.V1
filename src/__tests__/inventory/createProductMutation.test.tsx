/**
 * Create-product mutation must resolve when the RPC returns, not after
 * catalog/list refetches finish.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { rpc } from '@/lib/rpc'
import { useCreateProduct } from '@/hooks/useAdminProducts'
import { productKeys } from '@/hooks/useProducts'
import type { CreateProductParams } from '@/types/rpc'

vi.mock('@/lib/rpc', () => ({
  rpc: {
    createProduct: vi.fn(),
  },
}))

const params: CreateProductParams = {
  p_depot_id: 'depot-a',
  p_category_id: 'cat-food',
  p_name: 'Onion',
  p_photo_url: 'https://cdn.example.com/onion.jpg',
  p_units: [
    {
      unit_level: 0,
      unit_name: 'Piece',
      conversion_to_base: 1,
      cost_price_cfa: 100,
      selling_price_cfa: 150,
    },
  ],
  p_track_low_stock: false,
  p_low_stock_threshold: null,
}

describe('useCreateProduct', () => {
  beforeEach(() => {
    vi.mocked(rpc.createProduct).mockReset()
    vi.mocked(rpc.createProduct).mockResolvedValue({
      data: { id: 'prod-new' } as never,
      error: null,
    })
  })

  it('resolves mutateAsync before a hanging catalog refetch finishes', async () => {
    let releaseRefetch: () => void = () => undefined
    const refetchHold = new Promise<void>((resolve) => {
      releaseRefetch = resolve
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })

    function CatalogObserver({ children }: { children: ReactNode }) {
      useQuery({
        queryKey: productKeys.search('', 'depot-a', null),
        queryFn: async () => {
          await refetchHold
          return []
        },
      })
      return children
    }

    function wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <CatalogObserver>{children}</CatalogObserver>
        </QueryClientProvider>
      )
    }

    const { result } = renderHook(() => useCreateProduct(), { wrapper })

    const created = await result.current.mutateAsync(params)
    expect(created).toEqual({ id: 'prod-new' })
    expect(rpc.createProduct).toHaveBeenCalledTimes(1)

    releaseRefetch()
    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0)
    })
  })
})
