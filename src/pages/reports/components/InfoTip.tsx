import * as Tooltip from '@radix-ui/react-tooltip'

export function InfoTip({ text }: { text: string }) {
  if (!text) return null
  return (
    <Tooltip.Provider delayDuration={150}>
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-surface-muted text-[10px] font-semibold text-text-muted"
          aria-label={text}
        >
          i
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          className="z-50 max-w-xs rounded-lg bg-text-primary px-2.5 py-2 text-xs text-white shadow-md"
        >
          {text}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
    </Tooltip.Provider>
  )
}
