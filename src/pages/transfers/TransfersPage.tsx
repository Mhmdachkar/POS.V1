import { ArrowLeftRight } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/**
 * TransfersPage — Phase 9 implementation target.
 *
 * Will contain:
 * - Transfer list (pending / completed / cancelled)
 * - Create transfer (select from depot, to depot, per-item source+destination products)
 * - Transfer detail (items, status, completion)
 * - Complete transfer (complete_transfer RPC — atomic stock movement)
 * - Cancel transfer (cancel_transfer RPC)
 *
 * Completion uses SELECT ... FOR UPDATE in ascending product ID order
 * to prevent deadlocks between concurrent transfers.
 */
export function TransfersPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon={<ArrowLeftRight className="h-8 w-8" />}
        title="Transfers — Coming in Phase 9"
        description="Depot-to-depot stock transfer creation, detail, and completion will be implemented in Phase 9."
      />
    </div>
  )
}
