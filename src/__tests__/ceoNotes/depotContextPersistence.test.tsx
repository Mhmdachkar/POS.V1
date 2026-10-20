/**
 * CEO Notes — admin depot context survives hard reload via localStorage.
 * /pos forces a concrete depot; leaving /pos restores the previous scope.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import {
  adminDepotStorageKey,
  clearPersistedAdminDepot,
  readPersistedAdminDepot,
  writePersistedAdminDepot,
} from '@/lib/depotContextPersistence'
import { AppShell } from '@/components/layout/AppShell'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import type { Staff } from '@/types/database'
import { COMMON } from '@/lib/bilingual/common'

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInventory')>()
  return {
    ...actual,
    useDepotOptions: vi.fn(() => ({
      data: [
        { id: 'depot-a', name: 'Depot Dakar', code: 'DKR', is_active: true },
        { id: 'depot-b', name: 'Depot Abidjan', code: 'ABJ', is_active: true },
      ],
      isLoading: false,
    })),
  }
})

vi.mock('@/components/layout/AppRail', () => ({
  AppRail: () => <div data-testid="app-rail" />,
}))
vi.mock('@/components/layout/TopBar', () => ({
  TopBar: () => <div data-testid="top-bar" />,
}))

function adminStaff(): Staff {
  return {
    id: 'admin-1',
    username: 'admin',
    full_name: 'Admin User',
    role: 'admin',
    depot_id: null,
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function cashierStaff(): Staff {
  return {
    id: 'cashier-1',
    username: 'cashier',
    full_name: 'Cashier',
    role: 'cashier',
    depot_id: 'depot-a',
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('depotContextPersistence helpers', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({
      authLoadState: 'authorized',
      staff: adminStaff(),
      session: null,
      isLoading: false,
    })
  })

  it('writes and reads a concrete depot selection', () => {
    writePersistedAdminDepot('admin-1', { id: 'depot-a', name: 'Depot Dakar' })
    expect(readPersistedAdminDepot('admin-1')).toEqual({
      id: 'depot-a',
      name: 'Depot Dakar',
    })
    expect(localStorage.getItem(adminDepotStorageKey('admin-1'))).toContain('depot-a')
  })

  it('persists explicit All Depots as null id (not missing key)', () => {
    writePersistedAdminDepot('admin-1', { id: null, name: 'All Depots' })
    expect(readPersistedAdminDepot('admin-1')).toEqual({ id: null, name: null })
    expect(localStorage.getItem(adminDepotStorageKey('admin-1'))).not.toBeNull()
  })

  it('clear removes the key', () => {
    writePersistedAdminDepot('admin-1', { id: 'depot-a', name: 'Depot Dakar' })
    clearPersistedAdminDepot('admin-1')
    expect(readPersistedAdminDepot('admin-1')).toBeUndefined()
  })

  it('setCurrentDepot persists for admin and clear wipes persistence', () => {
    useDepotStore.getState().setCurrentDepot('depot-b', 'Depot Abidjan')
    expect(readPersistedAdminDepot('admin-1')).toEqual({
      id: 'depot-b',
      name: 'Depot Abidjan',
    })
    useDepotStore.getState().clear()
    expect(readPersistedAdminDepot('admin-1')).toBeUndefined()
    expect(useDepotStore.getState().currentDepotId).toBeNull()
  })

  it('setCurrentDepot does not persist for cashier', () => {
    useAuthStore.setState({ staff: cashierStaff() })
    useDepotStore.getState().setCurrentDepot('depot-a', 'Depot Dakar')
    expect(readPersistedAdminDepot('cashier-1')).toBeUndefined()
  })
})

describe('AppShell admin depot restore', () => {
  beforeEach(() => {
    localStorage.clear()
    useDepotStore.setState({
      currentDepotId: null,
      currentDepotName: null,
      availableDepots: [],
    })
    useAuthStore.setState({
      authLoadState: 'authorized',
      staff: adminStaff(),
      session: null,
      isLoading: false,
    })
  })

  function renderShell(path: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter(
      [
        {
          element: <AppShell />,
          children: [
            { path: '/', element: <div>page</div> },
            { path: '/pos', element: <div>pos-page</div> },
            { path: '/dashboard', element: <div>dashboard-page</div> },
          ],
        },
      ],
      { initialEntries: [path] },
    )
    const view = render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return { ...view, router }
  }

  it('AppShell on /pos restores persisted admin depot after empty store (hard reload)', async () => {
    writePersistedAdminDepot('admin-1', { id: 'depot-a', name: 'Depot Dakar' })
    renderShell('/pos')
    await waitFor(() => {
      expect(useDepotStore.getState().currentDepotId).toBe('depot-a')
      expect(useDepotStore.getState().currentDepotName).toBe('Depot Dakar')
    })
  })

  it('AppShell restores persisted admin depot after empty store (hard reload)', async () => {
    writePersistedAdminDepot('admin-1', { id: 'depot-b', name: 'Depot Abidjan' })
    renderShell('/')
    await waitFor(() => {
      expect(useDepotStore.getState().currentDepotId).toBe('depot-b')
      expect(useDepotStore.getState().currentDepotName).toBe('Depot Abidjan')
    })
  })

  it('AppShell on /pos defaults to first active depot when none selected (so catalog can load)', async () => {
    renderShell('/pos')
    await waitFor(() => {
      expect(useDepotStore.getState().currentDepotId).toBe('depot-a')
      expect(useDepotStore.getState().currentDepotName).toBe('Depot Dakar')
    })
  })

  it('AppShell on /pos overrides persisted All Depots with a concrete depot for selling', async () => {
    writePersistedAdminDepot('admin-1', { id: null, name: null })
    renderShell('/pos')
    await waitFor(() => {
      expect(useDepotStore.getState().currentDepotId).toBe('depot-a')
    })
  })

  it('leaving /pos restores the previous All Depots scope', async () => {
    writePersistedAdminDepot('admin-1', { id: null, name: null })
    const { router } = renderShell('/dashboard')
    await waitFor(() => {
      expect(useDepotStore.getState().currentDepotId).toBeNull()
    })

    await act(async () => {
      await router.navigate('/pos')
    })
    await waitFor(() => {
      expect(useDepotStore.getState().currentDepotId).toBe('depot-a')
    })

    await act(async () => {
      await router.navigate('/dashboard')
    })
    await waitFor(() => {
      expect(useDepotStore.getState().currentDepotId).toBeNull()
      expect(useDepotStore.getState().currentDepotName).toBe(COMMON.allDepots.fr)
    })
  })
})
