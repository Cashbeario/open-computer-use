"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { StopIcon } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${(s % 60).toString().padStart(2, "0")}s`
}

/**
 * StopTaskButton — the streaming "stop" control, but instead of killing the
 * run on click it opens a small, calm confirmation that nudges the user to let
 * the task finish.
 *
 * Why: most premature stops are impatience ("is it stuck?") or a misclick, not
 * a real desire to abandon the work. So the popover (a) reassures the agent is
 * alive (live pulse + elapsed + a working shimmer), (b) makes the progress
 * that's on the line salient (loss aversion), (c) gives an honest rational
 * incentive — finishing is faster than starting over — and (d) makes "Let it
 * finish" the effortless default while keeping "Stop anyway" one deliberate
 * click away. No dark patterns: clicking outside or pressing Escape simply
 * dismisses and the task keeps running; only "Stop anyway" calls onStop.
 */
export function StopTaskButton({
  startedAt,
  onStop,
  className,
}: {
  /** ms timestamp the current run began, or null if unknown. */
  startedAt: number | null
  onStop: () => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  // Tick the elapsed readout only while the popover is open — no per-second
  // re-render of the chat input the rest of the time.
  useEffect(() => {
    if (!open || startedAt == null) return
    setElapsed(Date.now() - startedAt)
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000)
    return () => clearInterval(id)
  }, [open, startedAt])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          type="button"
          aria-label="Stop task"
          className={cn("size-9 rounded-full transition-all duration-300 ease-out", className)}
        >
          <StopIcon className="size-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={10}
        collisionPadding={16}
        className="w-[264px] overflow-hidden rounded-2xl border border-border/60 bg-popover p-0 shadow-2xl"
      >
        <div className="flex flex-col">
          {/* Liveness header — a green pulse + elapsed says "it's working, not stuck". */}
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">
              Still working
            </span>
            {startedAt != null && (
              <span className="ml-auto text-[11px] font-medium tabular-nums text-muted-foreground/65">
                {formatElapsed(elapsed)}
              </span>
            )}
          </div>

          {/* Indeterminate shimmer — reinforces "actively working". */}
          <div className="relative mx-4 h-[3px] overflow-hidden rounded-full bg-foreground/[0.06]">
            <motion.div
              className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-foreground/35 to-transparent"
              animate={{ x: ["-120%", "320%"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>

          {/* Message — honest loss + rational incentive. */}
          <div className="px-4 pt-3 pb-1">
            <p className="text-[12.5px] leading-relaxed text-foreground/80">
              Stopping discards the progress it&rsquo;s made so far.
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground/65">
              Letting it finish is faster than starting over.
            </p>
          </div>

          {/* Actions — "Let it finish" is the easy default; "Stop anyway" stays. */}
          <div className="flex items-center gap-2 px-3 pb-3 pt-2.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 flex-1 items-center justify-center rounded-lg bg-foreground text-[12.5px] font-medium tracking-[-0.01em] text-background transition-all hover:bg-foreground/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Let it finish
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onStop()
              }}
              className="inline-flex h-8 items-center justify-center rounded-lg px-3 text-[12px] font-medium text-muted-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Stop anyway
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
