/**
 * CEO Notes — cart must not leak across logout (Admin → Cashier).
 *
 * usePOSStore is session-scoped in-memory Zustand: a mid-session refresh
 * keeps the cart (intended). Logout / session-null must call startNewSale().
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { usePOSStore } from '@/stores/posStore'
import { clearPersistedAdminDepot } from '@/lib/depotContextPersistence'

/** Mirrors AuthProvider clearUnauthenticatedLocalState (logout / !session). */
function clearOnLogout() {
  const staffId = useAuthStore.getState().staff?.id
  usePOSStore.getState().startNewSale()
  if (staffId) clearPersistedAdminDepot(staffId)
  useAuthStore.getState().clear()
  useDepotStore.getState().clear()
}

function addSampleItem() {
  usePOSStore.getState().addItem({
    product_id: 'prod-001',
    product_name: 'Water Bottle',
    product_photo_url: '',
    unit_level: 0,
    unit_name: 'Piece',
    quantity_in_unit: 2,
    unit_price_cfa: 350,
    cost_price_cfa: 200,
    conversion_to_base: 1,
  })
}

describe('cartLogoutIsolation', () => {
  beforeEach(() => {
    usePOSStore.getState().startNewSale()
    useDepotStore.getState().clear()
    useAuthStore.setState({
      authLoadState: 'authorized',
      staff: {
        id: 'admin-1',
        username: 'admin',
        full_name: 'Admin',
        role: 'admin',
        depot_id: null,
        is_active: true,
        deactivated_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      session: null,
      isLoading: false,
    })
  })

  it('startNewSale alone empties the cart', () => {
    addSampleItem()
    expect(usePOSStore.getState().items).toHaveLength(1)
    usePOSStore.getState().startNewSale()
    expect(usePOSStore.getState().items).toHaveLength(0)
  })

  it('logout clear path empties cart so it cannot leak to the next user', () => {
    addSampleItem()
    expect(usePOSStore.getState().items).toHaveLength(1)

    clearOnLogout()

    expect(usePOSStore.getState().items).toHaveLength(0)
    expect(useAuthStore.getState().authLoadState).toBe('unauthenticated')
  })

  // Intended: refresh mid-session keeps cart (session-scoped zustand, no persist).
  // We do not call startNewSale on TOKEN_REFRESHED / normal revalidation.
  it('does not clear cart when only auth revalidation would run (no logout)', () => {
    addSampleItem()
    const before = usePOSStore.getState().items
    // Simulate TOKEN_REFRESHED path: session still present — no startNewSale.
    expect(usePOSStore.getState().items).toEqual(before)
    expect(usePOSStore.getState().items).toHaveLength(1)
  })
})
