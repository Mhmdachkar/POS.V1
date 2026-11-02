import { fetchCustomer } from '@/hooks/useCustomers'
import { usePOSStore } from '@/stores/posStore'

/** Reload the POS selected customer after a return or payment so the chip matches the account. */
export async function refreshPosCustomer(customerId: string | null | undefined): Promise<void> {
  if (!customerId) return
  const selected = usePOSStore.getState().customer
  if (!selected || selected.id !== customerId) return
  try {
    const fresh = await fetchCustomer(customerId)
    if (usePOSStore.getState().customer?.id === customerId) {
      usePOSStore.getState().setCustomer(fresh)
    }
  } catch {
    /* keep the in-memory customer if the refetch fails */
  }
}
