import { User } from "lucide-react"
import { cn } from "@/lib/cn"

export type CustomerAccountTone = "settled" | "owing" | "inactive"

export function customerAccountTone(input: {
  balanceOwedCfa: number
  isActive: boolean
}): CustomerAccountTone {
  if (!input.isActive) return "inactive"
  if (input.balanceOwedCfa > 0) return "owing"
  return "settled"
}

export function customerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  const letters = parts.map((part) => part[0]?.toLocaleUpperCase() ?? "").join("")
  return letters || "?"
}

const TONE_CLASS: Record<CustomerAccountTone, string> = {
  settled: "bg-success-bg text-success-foreground ring-success/40",
  owing: "bg-danger-bg text-danger-foreground ring-danger/40",
  inactive: "bg-surface-muted text-text-muted ring-border",
}

export function CustomerAvatar({
  name,
  balanceOwedCfa,
  isActive,
  size = "md",
}: {
  name: string
  balanceOwedCfa: number
  isActive: boolean
  size?: "sm" | "md"
}) {
  const tone = customerAccountTone({ balanceOwedCfa, isActive })
  const initials = customerInitials(name)
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold ring-2",
        TONE_CLASS[tone],
        size === "sm" ? "h-8 w-8 text-[11px]" : "h-9 w-9 text-xs",
      )}
      aria-hidden="true"
    >
      {initials === "?" ? <User className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} /> : initials}
    </span>
  )
}
