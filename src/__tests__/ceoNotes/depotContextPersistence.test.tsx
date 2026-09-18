/**
 * CEO Notes — admin depot context survives hard reload via localStorage.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import {
  adminDepotStorageKey,
  clearPersistedAdminDepot,
  readPersistedAdminDepot,
  writePersistedAdminDepot,
} from '@/lib/depotContextPersistence'
import { AppShell } from '@/components/layout/AppShell'
import { PosShell } from '@/components/layout/PosShell'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import type { Staff } from '@/types/database'

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

vi.mock('@/components/layout/PosContextBar', () => ({
  PosContextBar: () => <div data-testid="pos-context-bar" />,
}))
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

describe('PosShell / AppShell admin depot restore', () => {
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

  function renderShell(kind: 'pos' | 'app') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const Shell = kind === 'pos' ? PosShell : AppShell
    return render(
      <MemoryRouter initialEntries={['/']}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<div>page</div>} />
            </Route>
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
  }

  it('PosShell restores persisted admin depot after empty store (hard reload)', async () => {
    writePersistedAdminDepot('admin-1', { id: 'depot-a', name: 'Depot Dakar' })
    renderShell('pos')
    await waitFor(() => {
      expect(useDepotStore.getState().currentDepotId).toBe('depot-a')
      expect(useDepotStore.getState().currentDepotName).toBe('Depot Dakar')
    })
  })

  it('AppShell restores persisted admin depot after empty store (hard reload)', async () => {
    writePersistedAdminDepot('admin-1', { id: 'depot-b', name: 'Depot Abidjan' })
    renderShell('app')
    await waitFor(() => {
      expect(useDepotStore.getState().currentDepotId).toBe('depot-b')
      expect(useDepotStore.getState().currentDepotName).toBe('Depot Abidjan')
    })
  })

  it('PosShell defaults to first active depot when none selected (so catalog can load)', async () => {
    renderShell('pos')
    await waitFor(() => {
      expect(useDepotStore.getState().currentDepotId).toBe('depot-a')
      expect(useDepotStore.getState().currentDepotName).toBe('Depot Dakar')
    })
  })

  it('PosShell overrides persisted All Depots with a concrete depot for selling', async () => {
    writePersistedAdminDepot('admin-1', { id: null, name: null })
    renderShell('pos')
    await waitFor(() => {
      expect(useDepotStore.getState().currentDepotId).toBe('depot-a')
    })
  })
})
