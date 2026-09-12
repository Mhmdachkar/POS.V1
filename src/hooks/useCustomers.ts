/**
 * useCustomers — TanStack Query hooks for customer data.
 *
 * Customers are global (not depot-scoped) — any staff member can
 * look up or create a customer. RLS governs read access.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Customer } from '@/types/database'

// ─────────────────────────────────────────────────────────────────
// Query key factory
// ─────────────────────────────────────────────────────────────────

export const customerKeys = {
  all:    ['customers'] as const,
  search: (query: string) => ['customers', 'search', query] as const,
  detail: (id: string)    => ['customers', 'detail', id] as const,
}

// ─────────────────────────────────────────────────────────────────
// Fetch helpers
// ─────────────────────────────────────────────────────────────────

async function fetchCustomerSearch(query: string): Promise<Customer[]> {
  let q = supabase
    .from('customers')
    .select('*')
    .order('name')
    .limit(30)

  if (query.trim()) {
    q = q.or(`name.ilike.%${query.trim()}%,phone.ilike.%${query.trim()}%`)
  }

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Customer[]
}

async function fetchCustomer(id: string): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Customer
}

// ─────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────

/**
 * useCustomerSearch — debounced customer search by name or phone.
 */
export function useCustomerSearch(query: string, enabled = true) {
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  return useQuery({
    queryKey: customerKeys.search(debouncedQuery),
    queryFn:  () => fetchCustomerSearch(debouncedQuery),
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

/**
 * useCustomer — fetch a single customer by ID.
 * Used to display up-to-date balance in the checkout panel.
 */
export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: customerKeys.detail(id ?? ''),
    queryFn:  () => fetchCustomer(id!),
    enabled:  !!id,
    staleTime: 15_000, // Refresh balance more frequently
  })
}

/**
 * useCreateCustomer — inline customer creation from the POS selector.
 * Creates a customer record directly via Supabase (no special RPC for this).
 *
 * Note: customer creation is allowed for cashier + admin roles.
 * The auth guard and RLS handle access control.
 */
export function useCreateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { name: string; phone?: string }) => {
      const { data, error } = await supabase
        .from('customers')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          balance_owed_cfa: 0,
        } as any)
        .select('*')
        .single()
      if (error) throw error
      return data as Customer
    },
    onSuccess: () => {
      // Invalidate all customer search results
      queryClient.invalidateQueries({ queryKey: customerKeys.all })
    },
  })
}
