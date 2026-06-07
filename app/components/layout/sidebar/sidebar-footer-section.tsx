"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import {
  IconArrowUp,
  IconBook2,
  IconCheck,
  IconCompass,
  IconCreditCard,
  IconGift,
  IconInfinity,
  IconLoader2,
  IconLogout,
  IconMessage2,
  IconSettings,
  IconVideo,
  IconX,
} from "@tabler/icons-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useCredits } from "@/lib/hooks/use-credits"
import { useSubscription } from "@/lib/hooks/use-subscription"
import { useUser } from "@/lib/user-store/provider"
import { createClient } from "@/lib/supabase/client"
import { AnimatedThemeToggler } from "@/components/magicui/animated-theme-toggler"
import { useAccountDialog } from "@/lib/account-dialog-store"

// ─── Credit health model ──────────────────────────────────────────
type CreditHealth = "healthy" | "low" | "depleted"

function getHealth(balance: number, totalPurchased: number): CreditHealth {
  if (balance <= 0) return "depleted"
  if (balance < 50) return "low"
  if (totalPurchased > 0 && balance / totalPurchased < 0.15) return "low"
  return "healthy"
}

const HEALTH = {
  healthy: {
    dot: "bg-foreground/30",
    text: "text-foreground",
  },
  low: {
    dot: "bg-amber-500 dark:bg-amber-400",
    text: "text-amber-600 dark:text-amber-400",
  },
  depleted: {
    dot: "bg-rose-500 dark:bg-rose-400",
    text: "text-rose-600 dark:text-rose-400",
  },
} as const

// ─── Feedback compose card ────────────────────────────────────────
//   The active compose surface — eyebrow, autoresizing textarea,
//   keyboard hint, send button, sending/sent/error states. Doesn't
//   own its own visibility; the caller mounts/unmounts it. Submits
//   directly to the Supabase `feedback` table under the row-level
//   policy "Users can create feedback".
//
//   Status: idle → sending → sent (auto-dismiss 1.4s) | error.
//   `onActiveChange(false)` fires once status reaches "sent" so a
//   parent popover can unpin and prepare to close gracefully.
//
//   Mobile: textarea is 16px on small screens to defeat the iOS
//   focus-zoom, 12.5px on sm+. Keyboard hint hidden under sm.
function FeedbackComposeCard({
  userId,
  onCancel,
  onSent,
  onActiveChange,
}: {
  userId: string
  onCancel: () => void
  onSent: () => void
  onActiveChange?: (active: boolean) => void
}) {
  const [text, setText] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    onActiveChange?.(status !== "sent")
  }, [status, onActiveChange])

  // Autofocus + auto-resize (max ~160px → ~6 lines, then scrolls).
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    ta.style.height = "auto"
    ta.style.height = Math.min(160, ta.scrollHeight) + "px"
  }, [text])

  const submit = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || status === "sending") return
    setStatus("sending")
    try {
      const supabase = await createClient()
      if (!supabase) throw new Error("Supabase unavailable")
      const { error } = await supabase
        .from("feedback")
        .insert({ user_id: userId, message: trimmed })
      if (error) throw error
      setStatus("sent")
      setTimeout(() => {
        setText("")
        setStatus("idle")
        onSent()
      }, 1400)
    } catch {
      setStatus("error")
    }
  }, [text, status, userId, onSent])

  return (
    <div
      className={cn(
        // Solid, full-opacity card — it floats in its own footer popover
        // (which is transparent), so the surface lives here: opaque
        // popover bg + border + lifted shadow.
        "overflow-hidden rounded-xl",
        "bg-popover text-popover-foreground",
        "border border-border/60 dark:border-white/[0.06]",
        "shadow-2xl",
        "animate-in fade-in-0 slide-in-from-top-1 duration-200"
      )}
    >
      <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
        <span className="inline-flex items-center gap-1.5">
          <IconMessage2 size={11} stroke={1.75} className="text-foreground/45" />
          <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-foreground/45">
            Feedback
          </span>
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="h-5 w-5 flex items-center justify-center rounded text-foreground/40 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
        >
          <IconX size={11} stroke={1.75} />
        </button>
      </div>

      {status === "sent" ? (
        <div className="flex items-center gap-2 px-3 pt-1 pb-3 animate-in fade-in-0 duration-200">
          <span className="h-5 w-5 rounded-full bg-emerald-500/15 dark:bg-emerald-400/15 flex items-center justify-center shrink-0">
            <IconCheck size={11} stroke={2.5} className="text-emerald-600 dark:text-emerald-400" />
          </span>
          <span className="text-[12px] font-medium text-foreground/80">
            Got it. Thank you.
          </span>
        </div>
      ) : (
        <>
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                e.stopPropagation()
                onCancel()
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="What's on your mind?"
            rows={3}
            disabled={status === "sending"}
            className={cn(
              "block w-full resize-none border-0 bg-transparent px-2.5 pt-0 pb-1.5",
              "text-base leading-snug text-foreground placeholder:text-foreground/30 sm:text-[12.5px]",
              "outline-none focus:outline-none focus-visible:outline-none focus:ring-0",
              "max-h-[160px] overflow-y-auto",
              "disabled:opacity-60"
            )}
          />
          <div className="flex items-center justify-between gap-2 border-t border-foreground/[0.05] px-2 py-1.5 dark:border-white/[0.04]">
            {status === "error" ? (
              <span className="text-[10.5px] font-medium text-rose-500 dark:text-rose-400">
                Couldn&rsquo;t send. Try again.
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] tracking-[0.02em] text-foreground/35">
                <kbd className="font-sans">⌘</kbd>
                <span>+</span>
                <kbd className="font-sans">↵</kbd>
                <span className="ml-0.5">to send</span>
              </span>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim() || status === "sending"}
              aria-label="Send feedback"
              className={cn(
                "ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-md",
                "bg-foreground text-background text-[11.5px] font-semibold tracking-[-0.01em]",
                "shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.08)]",
                "transition-all duration-150",
                "disabled:opacity-30 disabled:cursor-not-allowed",
                "enabled:hover:opacity-90 enabled:active:scale-[0.97]"
              )}
            >
              {status === "sending" ? (
                <>
                  <IconLoader2 size={12} stroke={2} className="animate-spin" />
                  <span>Sending</span>
                </>
              ) : (
                <>
                  <span>Send</span>
                  <IconArrowUp size={11} stroke={2.25} />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Avatar menu ──────────────────────────────────────────────────
//   Progressive disclosure: at-rest the footer shows just identity.
//   Everything else (account, billing, referral, talk-to-us, sign out)
//   lives one click away. The trigger uses Popover (not HoverCard) so
//   it works on touch.
function AvatarMenu({
  user,
  onAction,
  chrome = "popover",
}: {
  user: { id: string; display_name?: string | null; email?: string | null; profile_image?: string | null } | null | undefined
  onAction: () => void
  /** "popover" (desktop, default): self-contained card with border,
   *  shadow, rounded corners, fixed 240px width.
   *  "drawer" (mobile bottom sheet): full-width content, no card chrome
   *  — the parent <DrawerContent> already provides the surface,
   *  drag-handle pill, and rounded top edges. */
  chrome?: "popover" | "drawer"
}) {
  const t = useTranslations("sidebar")
  const openDialog = useAccountDialog((s) => s.open)
  const { signOut } = useUser()
  const displayName = user?.display_name || user?.email?.split("@")[0] || t("user")

  type Item =
    | { kind: "button"; icon: typeof IconSettings; label: string; onClick: () => void }
    | { kind: "link"; icon: typeof IconSettings; label: string; href: string }
    | { kind: "external"; icon: typeof IconSettings; label: string; href: string }

  const items: Item[] = [
    // "Account" is a generic "open settings" entry, not a deep-link
    // to the General profile section. On the mobile drawer this opens
    // the dialog at the section-list view so the user can pick where
    // to go (Memory, Appearance, Billing, …) instead of being dropped
    // into a specific panel. Desktop renders nav + content side-by-side
    // and ignores the hint, so behavior there is unchanged.
    { kind: "button", icon: IconSettings, label: t("account"), onClick: () => { openDialog("account", { mobileView: "menu" }); onAction() } },
    { kind: "button", icon: IconCreditCard, label: t("credits.buy"), onClick: () => { openDialog("billing"); onAction() } },
    { kind: "link", icon: IconBook2, label: t("guide"), href: "/guide" },
    { kind: "link", icon: IconCompass, label: "Community", href: "/discover" },
    { kind: "link", icon: IconGift, label: t("inviteEarn"), href: "/referral" },
    { kind: "external", icon: IconVideo, label: t("talkToUs"), href: "https://cal.com/coasty/15min" },
  ]

  // Drawer rows are slightly taller for comfortable thumb tap targets;
  // popover rows stay compact since they're mouse-hit. Same
  // px/gap/colors otherwise so the menu reads identically across both.
  const rowClass = cn(
    "w-full flex items-center gap-2.5 px-2 rounded-md text-left transition-colors duration-100",
    "text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04] dark:hover:bg-white/[0.04]",
    chrome === "drawer" ? "py-2.5" : "py-[7px]",
  )

  // Outer chrome.
  //   popover: card (border + shadow + rounded + bg + fixed width).
  //   drawer:  bare; the <DrawerContent> provides the surface so this
  //            component can grow to the sheet's full width and skip the
  //            card decorations.
  const outerClass = cn(
    "overflow-hidden",
    chrome === "popover"
      ? "w-60 rounded-xl border border-border/60 bg-popover shadow-2xl dark:border-white/[0.06]"
      : "w-full",
  )

  // Header padding tightens slightly on drawer so the avatar + name +
  // email row doesn't read as a separate "card" on top of the sheet.
  const headerClass = cn(
    "flex items-center gap-3 border-b border-border/30 dark:border-white/[0.05]",
    chrome === "drawer" ? "px-3 pt-2 pb-3" : "px-3.5 pt-3.5 pb-3",
  )

  return (
    <div className={outerClass}>
      <div className={headerClass}>
        <Avatar className="h-9 w-9 ring-1 ring-border/40">
          <AvatarImage src={user?.profile_image || undefined} />
          <AvatarFallback className="bg-foreground/[0.06] text-foreground text-[11px] font-semibold">
            {displayName[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[12.5px] font-semibold text-foreground truncate leading-tight">
            {displayName}
          </span>
          {user?.email && (
            <span className="text-[10.5px] text-muted-foreground/70 truncate mt-0.5">
              {user.email}
            </span>
          )}
        </div>
      </div>

      <div className="p-1.5">
        {items.map((item, i) => {
          const Icon = item.icon
          const inner = (
            <>
              <Icon size={14} stroke={1.5} className="shrink-0" />
              <span className="text-[12px] font-medium flex-1 truncate">{item.label}</span>
            </>
          )
          if (item.kind === "link") {
            return (
              <Link key={i} href={item.href} onClick={onAction} className={rowClass}>
                {inner}
              </Link>
            )
          }
          if (item.kind === "external") {
            return (
              <a
                key={i}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onAction}
                className={rowClass}
              >
                {inner}
              </a>
            )
          }
          return (
            <button key={i} type="button" onClick={item.onClick} className={rowClass}>
              {inner}
            </button>
          )
        })}
      </div>

      <div className="p-1.5 border-t border-border/30 dark:border-white/[0.05]">
        <button
          type="button"
          onClick={() => {
            signOut()
            onAction()
          }}
          className="w-full flex items-center gap-2.5 px-2 py-[7px] rounded-md text-left transition-colors duration-100 text-muted-foreground/75 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/[0.06]"
        >
          <IconLogout size={14} stroke={1.5} className="shrink-0" />
          <span className="text-[12px] font-medium">Sign out</span>
        </button>
      </div>
    </div>
  )
}

// ─── Feathered seam ───────────────────────────────────────────────
//   The footer's single hairline. A 1px gradient that fades to
//   transparent at both corners, so the footer detaches from the scroll
//   list with a soft seam rather than a hard ruled border.
function FooterSeam({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "h-px bg-gradient-to-r from-transparent via-foreground/[0.13] to-transparent dark:via-white/[0.08]",
        className,
      )}
    />
  )
}

// ─── Footer feedback popover ──────────────────────────────────────
//   The footer's Feedback action: a quiet icon that pops the compact
//   compose card in place, anchored above the icon. Reuses
//   FeedbackComposeCard; outside-click, Escape, or the card's X all
//   dismiss it.
function FeedbackPopButton({ userId, className }: { userId: string; className: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Send feedback" className={className}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 5h14a2 2 0 012 2v8a2 2 0 01-2 2h-7l-4 3v-3H5a2 2 0 01-2-2V7a2 2 0 012-2z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="11" r="0.9" fill="currentColor" />
                <circle cx="12" cy="11" r="0.9" fill="currentColor" />
                <circle cx="15" cy="11" r="0.9" fill="currentColor" />
              </svg>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        {!open && (
          <TooltipContent side="top" sideOffset={6}>
            <span className="font-medium text-[12px]">Feedback</span>
          </TooltipContent>
        )}
      </Tooltip>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={10}
        collisionPadding={16}
        className="w-72 p-0 border-0 bg-transparent shadow-none"
      >
        <FeedbackComposeCard
          userId={userId}
          onCancel={() => setOpen(false)}
          onSent={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

// Shared utility-icon button (Run locally, Feedback, theme) — a quiet
// 28px hit target that brightens with a soft fill on hover, so the
// three read as one cluster on the identity row.
const UTIL_BTN = cn(
  "flex h-7 w-7 items-center justify-center shrink-0 rounded-md",
  "text-foreground/35 hover:text-foreground/75 hover:bg-foreground/[0.04]",
  "transition-colors duration-150 cursor-pointer",
)

// Avatar trigger — same 28px footprint as the utility icons so the row
// reads as one uniform bar, but rounded-full to hug the round avatar.
const AVATAR_BTN = cn(
  "flex h-7 w-7 items-center justify-center shrink-0 rounded-full",
  "transition-colors duration-150 cursor-pointer",
  "hover:bg-foreground/[0.06] data-[state=open]:bg-foreground/[0.08]",
)

// ═══════════════════════════════════════════════════════════════════
//  SidebarFooterSection
//  ─────────────────────
//  Two rows beneath a single feathered seam: a centered credits hero and
//  an icon bar (avatar + Run-locally / Feedback / theme, evenly spaced),
//  held apart by air rather than dividers. No cards, no decorative
//  backgrounds. Everything else lives in the avatar menu.
// ═══════════════════════════════════════════════════════════════════
export const SidebarFooterSection = memo(function SidebarFooterSection({
  user,
  expanded,
  isMobile,
  closeMobileIfNeeded,
}: {
  user: { id: string; display_name?: string | null; email?: string | null; profile_image?: string | null } | null | undefined
  expanded: boolean
  isMobile: boolean
  closeMobileIfNeeded: () => void
}) {
  const t = useTranslations("sidebar")
  const openAccountDialog = useAccountDialog((s) => s.open)
  const { credits } = useCredits()
  const { isUnlimitedPlan } = useSubscription()

  const balance = credits?.balance ?? 0
  const totalPurchased = credits?.total_purchased ?? 0
  // For unlimited plans, force "healthy" — the sentinel balance would
  // always read healthy anyway, but the visual must render "Unlimited"
  // (with the amber accent) instead of a number.
  const health = isUnlimitedPlan ? "healthy" : getHealth(balance, totalPurchased)
  const c = HEALTH[health]

  const displayName = user?.display_name || user?.email?.split("@")[0] || t("user")

  // Avatar menu open state. (Feedback now composes in its own footer
  // popover, so the menu no longer needs a pin-to-stay-open guard.)
  const [menuOpen, setMenuOpen] = useState(false)

  // ─── Collapsed icon rail ───────────────────────────────────────
  // CRITICAL: do NOT use `items-center` on the flex-col container.
  // The sidebar's outer panel animates its `width` over 280ms when
  // toggling between expanded (216px) and collapsed (48px). During
  // that transit the COLLAPSED branch is what's rendered (React
  // flips the `expanded` flag instantly while the width tweens).
  // If children were `items-center`'d, they'd be re-centered inside
  // whatever the *current* container width happens to be on each
  // animation frame, sliding horizontally from the wide center down
  // to the narrow center.
  //
  // Instead, anchor everything to the left edge — buttons are
  // `w-full`, content sits at the button's left content edge with
  // no centering. The icon's x-position is then a pure function of
  // SidebarFooter padding (8) + section padding (4) = sidebar-x=12,
  // independent of container width. The avatar lands at x=12..36
  // (center 24) at every frame of the animation, exactly like the
  // header logo and the expanded identity row.
  if (!expanded) {
    return (
      <div className="flex flex-col gap-1 px-1 pt-0 pb-2">
        {/* Feathered seam — the footer's one hairline (see expanded). */}
        <FooterSeam className="mb-1" />
        {user && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => openAccountDialog("billing")}
                className="flex h-8 w-full items-center rounded-md hover:bg-foreground/[0.04] transition-colors"
              >
                {/* The 24×24 wrapper places the credit dot in the
                    same column as the avatar below — keeps the icon
                    rail visually aligned at sidebar-x=24. */}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {isUnlimitedPlan ? (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                  <IconInfinity size={12} stroke={2.5} />
                  Unlimited credits
                </span>
              ) : (
                <>
                  <span className="font-semibold tabular-nums">{balance.toLocaleString()}</span>
                  <span className="text-muted-foreground ml-1">{t("credits.creditsLeft")}</span>
                </>
              )}
            </TooltipContent>
          </Tooltip>
        )}

        {user && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => openAccountDialog()}
                className="flex h-8 w-full items-center rounded-md hover:bg-foreground/[0.04] transition-colors"
              >
                <Avatar className="h-6 w-6 shrink-0 ring-1 ring-border/40">
                  <AvatarImage src={user?.profile_image || undefined} />
                  <AvatarFallback className="bg-foreground/[0.06] text-foreground text-[9px] font-semibold">
                    {displayName[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {displayName}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    )
  }

  // ─── Expanded ──────────────────────────────────────────────────
  // Padding math (the avatar's pixel position must match collapsed):
  //   sidebar-x=0 → SidebarFooter p-2 (8px) → section px-1 (4px)
  //   → identity row no padding → avatar h-6 (24×24)
  //   left edge: 8 + 4 = 12. center: 12 + 12 = 24. ✓
  // In collapsed mode the avatar (h-6 inside h-8 button, items-center
  // in a 48px sidebar) lands at the same x=12..36 box. So the avatar
  // does not move during the expand/collapse animation — only the
  // display name fades in/out beside it, exactly like nav rows.
  //
  // Section padding is px-1 (not px-2.5) precisely so the footer's
  // left column aligns with the header logo at sidebar-x=12 and with
  // the avatar's collapsed position. The credits "REMAINING" eyebrow
  // and big balance number now share the same left rail as the logo
  // above and the avatar below.
  return (
    <div className="px-1 pt-0 pb-2.5">
      {/* Feathered seam — the footer's one hairline, fading to
          transparent at both corners so the footer detaches from the
          scroll list with a soft seam instead of a hard ruled border. */}
      <FooterSeam className="mb-3" />

      {/* ── Row 1: Credits — the hero element ── */}
      {user && (
        <button
          type="button"
          onClick={() => {
            openAccountDialog("billing")
            if (isMobile) closeMobileIfNeeded()
          }}
          className="group block w-full text-center rounded-md px-1 py-1 -mx-1 transition-colors hover:bg-foreground/[0.025]"
        >
          {isUnlimitedPlan ? (
            // Unlimited: one clean line. The amber wordmark is the
            // status itself, so no "PLAN" eyebrow and no separate dot.
            <span className="inline-flex items-center justify-center gap-1.5 text-[24px] font-semibold tracking-[-0.025em] leading-none text-foreground">
              <IconInfinity size={26} stroke={2.4} />
              <span>Unlimited</span>
            </span>
          ) : (
            <>
              {/* Numeric balance keeps its eyebrow — the small label is
                  what gives the raw number meaning, so it earns its place. */}
              <div className="flex items-center justify-center gap-1.5 mb-[5px]">
                <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-foreground/35">
                  {t("credits.remaining")}
                </span>
                <span className={cn("h-1 w-1 rounded-full transition-colors", c.dot)} />
              </div>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-[28px] font-semibold tabular-nums tracking-[-0.025em] leading-none text-foreground">
                  {balance.toLocaleString()}
                </span>
                {totalPurchased > 0 && totalPurchased > balance && (
                  <span className="text-[10px] text-foreground/30 tabular-nums leading-none">
                    / {totalPurchased.toLocaleString()}
                  </span>
                )}
              </div>
            </>
          )}
        </button>
      )}

      {/* ── Row 2: Account + utility bar ──
          Just icons now — the avatar (opens the account menu), Run
          locally, Feedback, and the theme toggle — spread edge-to-edge
          so the row reads as a tidy icon bar beneath the centered
          credits hero. No name label; the avatar alone carries identity,
          exactly like the collapsed rail. `justify-between` anchors the
          avatar to the left rail and the theme toggle to the right, with
          the two actions evenly spaced between. */}
      <div className="mt-3.5 flex items-center justify-between">
        {user ? (
          // Same surface on both viewports; only the menu container
          // differs — desktop a right-anchored Popover card, mobile a
          // bottom Drawer (a side="right" popover would render off the
          // left-edge sidebar drawer on a phone).
          isMobile ? (
            <>
              <button
                type="button"
                aria-label="Open account menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(true)}
                data-state={menuOpen ? "open" : "closed"}
                className={AVATAR_BTN}
              >
                <Avatar className="h-6 w-6 shrink-0 ring-1 ring-border/40">
                  <AvatarImage src={user?.profile_image || undefined} />
                  <AvatarFallback className="bg-foreground/[0.06] text-foreground text-[9px] font-semibold">
                    {displayName[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
              <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
                <DrawerContent
                  className={cn(
                    "max-h-[82dvh] focus:outline-none",
                    "rounded-t-2xl border-t border-border/40 dark:border-white/[0.06]",
                  )}
                >
                  <DrawerTitle className="sr-only">Account menu</DrawerTitle>
                  <div className="flex-1 min-h-0 overflow-y-auto pb-2">
                    <AvatarMenu
                      chrome="drawer"
                      user={user}
                      onAction={() => {
                        setMenuOpen(false)
                        closeMobileIfNeeded()
                      }}
                    />
                  </div>
                </DrawerContent>
              </Drawer>
            </>
          ) : (
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Open account menu"
                  className={AVATAR_BTN}
                >
                  <Avatar className="h-6 w-6 shrink-0 ring-1 ring-border/40">
                    <AvatarImage src={user?.profile_image || undefined} />
                    <AvatarFallback className="bg-foreground/[0.06] text-foreground text-[9px] font-semibold">
                      {displayName[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="end"
                sideOffset={12}
                collisionPadding={16}
                className="w-auto p-0 border-0 bg-transparent shadow-none"
              >
                <AvatarMenu
                  user={user}
                  onAction={() => {
                    setMenuOpen(false)
                    closeMobileIfNeeded()
                  }}
                />
              </PopoverContent>
            </Popover>
          )
        ) : (
          // Logged-out: an empty avatar-sized slot keeps the theme
          // toggle pinned to the right edge.
          <span className="h-7 w-7" />
        )}

        {/* Run locally + Feedback — quiet icon actions between the avatar
            and the theme toggle. Tooltips name them. */}
        {user?.id && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closeMobileIfNeeded}
                  aria-label="Run locally"
                  className={UTIL_BTN}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="2" y="3" width="20" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M12 7.5v4.5m0 0l-2-2m2 2l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                <span className="font-medium text-[12px]">Run locally</span>
              </TooltipContent>
            </Tooltip>

            <FeedbackPopButton userId={user.id} className={UTIL_BTN} />
          </>
        )}

        <AnimatedThemeToggler className={UTIL_BTN} />
      </div>
    </div>
  )
})
