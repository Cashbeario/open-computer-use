"use client"

import { forwardRef, memo, useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import {
  IconArrowUp,
  IconBook2,
  IconCheck,
  IconCoins,
  IconCompass,
  IconCreditCard,
  IconDeviceDesktop,
  IconGift,
  IconInfinity,
  IconLoader2,
  IconLogout,
  IconMessage2,
  IconMoon,
  IconSettings,
  IconSun,
  IconVideo,
  IconWallet,
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
import { useAccountDialog } from "@/lib/account-dialog-store"
import { usePlatformMode } from "@/lib/platform-mode-store"
import { useApiWallet } from "@/lib/hooks/use-api-wallet"

type UserLike =
  | { id: string; display_name?: string | null; email?: string | null; profile_image?: string | null }
  | null
  | undefined

// First grapheme of a name, surrogate-pair safe (Array.from splits on code
// points, so an emoji- or astral-leading name yields a whole glyph not a
// broken half).
function initialOf(name: string) {
  return Array.from(name)[0]?.toUpperCase() ?? "?"
}

// ─── Shared row recipe ────────────────────────────────────────────
//   Byte-for-byte the nav row (see sidebar-nav-section.tsx NavButton):
//   h-[30px] pill, 16px icon centered at sidebar-x=24 in both modes,
//   12.5px medium label, the same quiet hover/active and a real focus
//   ring. The footer is just three more of these, so it reads as a
//   continuation of the nav rather than its own surface.
const ROW = cn(
  "group/btn relative flex w-full items-center gap-2.5 px-2 h-[30px] rounded-lg transition-colors duration-150",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
  "text-foreground/55 hover:text-foreground/90 hover:bg-foreground/[0.04] dark:hover:bg-white/[0.04]",
  "data-[state=open]:bg-foreground/[0.06] data-[state=open]:text-foreground/90 dark:data-[state=open]:bg-white/[0.06]",
)

// Shared inner content (icon + label + optional trailing). Used by the
// button rows (Credits / Feedback / Account triggers) AND the Run-locally
// link row, so every footer row is pixel-identical. Collapsed
// (expanded=false) drops the label/trailing and shows just the icon.
function RowInner({
  icon,
  label,
  trailing,
  expanded,
  iconClassName,
}: {
  icon: React.ReactNode
  label: React.ReactNode
  trailing?: React.ReactNode
  expanded: boolean
  iconClassName?: string
}) {
  return (
    <>
      <span
        className={cn(
          "shrink-0 flex items-center justify-center w-4 h-4 transition-colors duration-150 group-hover/btn:text-foreground/80",
          iconClassName,
        )}
      >
        {icon}
      </span>
      {expanded && (
        <>
          <span className="flex-1 truncate text-left text-[12.5px] font-medium tracking-[-0.01em]">
            {label}
          </span>
          {trailing != null && <span className="shrink-0">{trailing}</span>}
        </>
      )}
    </>
  )
}

// The button is the trigger surface for Popover/Drawer/Tooltip (all via
// asChild), so it forwards ref + props.
const FooterRowButton = forwardRef<
  HTMLButtonElement,
  {
    icon: React.ReactNode
    label: React.ReactNode
    trailing?: React.ReactNode
    expanded: boolean
    iconClassName?: string
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function FooterRowButton(
  { icon, label, trailing, expanded, iconClassName, className, ...props },
  ref,
) {
  return (
    <button ref={ref} type="button" className={cn(ROW, className)} {...props}>
      <RowInner icon={icon} label={label} trailing={trailing} expanded={expanded} iconClassName={iconClassName} />
    </button>
  )
})

// Wrap a (possibly already-trigger) node in a right-side tooltip when the
// rail is collapsed — the only thing nav rows add at 48px.
function collapsedTooltip(expanded: boolean, node: React.ReactNode, label: React.ReactNode) {
  if (expanded) return node
  return (
    <Tooltip>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {typeof label === "string" ? (
          <span className="font-medium text-[12px]">{label}</span>
        ) : (
          label
        )}
      </TooltipContent>
    </Tooltip>
  )
}

// ─── Credit health → trailing number color ────────────────────────
//   The balance is the footer's one quiet signal: neutral at rest,
//   tinting amber/rose only when low/depleted (progressive disclosure —
//   a healthy account looks identical to every other row).
type CreditHealth = "healthy" | "low" | "depleted"

function getHealth(balance: number, totalPurchased: number): CreditHealth {
  if (balance <= 0) return "depleted"
  if (balance < 50) return "low"
  if (totalPurchased > 0 && balance / totalPurchased < 0.15) return "low"
  return "healthy"
}

const HEALTH_TEXT: Record<CreditHealth, string> = {
  healthy: "text-foreground/45",
  low: "text-amber-600 dark:text-amber-400",
  depleted: "text-rose-600 dark:text-rose-400",
}

// ─── Feedback compose card ────────────────────────────────────────
//   Unchanged compose surface — eyebrow, autoresizing textarea, keyboard
//   hint, send button, idle→sending→sent|error. `bare` drops its own card
//   chrome when it lives inside a Drawer (the sheet provides the surface).
//   Mobile: textarea is 16px to defeat iOS focus-zoom, 12.5px on sm+.
function FeedbackComposeCard({
  userId,
  onCancel,
  onSent,
  bare = false,
}: {
  userId: string
  onCancel: () => void
  onSent: () => void
  bare?: boolean
}) {
  const [text, setText] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Autofocus once, then auto-resize on input (max ~160px → scrolls).
  useEffect(() => {
    taRef.current?.focus()
  }, [])
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = Math.min(160, ta.scrollHeight) + "px"
  }, [text])

  const submit = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || status === "sending") return
    setStatus("sending")
    try {
      const supabase = createClient()
      if (!supabase) throw new Error("Supabase unavailable")
      const { error } = await supabase
        .from("feedback")
        .insert({ user_id: userId, message: trimmed })
      if (error) throw error
      setText("")
      setStatus("sent")
      setTimeout(() => {
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
        "overflow-hidden rounded-xl",
        bare
          ? "bg-transparent"
          : "bg-popover text-popover-foreground border border-border/60 dark:border-white/[0.06] shadow-2xl animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
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
          className="h-6 w-6 flex items-center justify-center rounded-md text-foreground/40 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
        >
          <IconX size={12} stroke={1.75} />
        </button>
      </div>

      {status === "sent" ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 px-3 pt-1 pb-3 animate-in fade-in-0 duration-200"
        >
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
              "disabled:opacity-60",
            )}
          />
          <div className="flex items-center justify-between gap-2 border-t border-foreground/[0.05] px-2 py-1.5 dark:border-white/[0.04]">
            {status === "error" ? (
              <span className="text-[10.5px] font-medium text-rose-500 dark:text-rose-400">
                Couldn&rsquo;t send. Try again.
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] tracking-[0.02em] text-foreground/35">
                <kbd className="font-sans">⌘/Ctrl</kbd>
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
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
                "disabled:opacity-30 disabled:cursor-not-allowed",
                "enabled:hover:opacity-90 enabled:active:scale-[0.97]",
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

// ─── Account menu ─────────────────────────────────────────────────
//   Progressive disclosure: the footer shows identity; everything else
//   (account, billing, guide, community, invite, talk-to-us, run-locally,
//   theme, sign out) lives one click away. Same body in both chromes —
//   only padding/width differs. "popover" (desktop) paints its own card;
//   "drawer" (mobile) is bare because <DrawerContent> is the surface.
function AccountMenu({
  user,
  onAction,
  chrome = "popover",
}: {
  user: NonNullable<UserLike>
  onAction: () => void
  chrome?: "popover" | "drawer"
}) {
  const t = useTranslations("sidebar")
  const openDialog = useAccountDialog((s) => s.open)
  const { signOut } = useUser()
  const { resolvedTheme, setTheme } = useTheme()
  const [themeReady, setThemeReady] = useState(false)
  useEffect(() => setThemeReady(true), [])
  const isDark = resolvedTheme === "dark"

  const displayName = user.display_name || user.email?.split("@")[0] || t("user")

  type Item =
    | { kind: "button"; icon: typeof IconSettings; label: string; onClick: () => void }
    | { kind: "link"; icon: typeof IconSettings; label: string; href: string }
    | { kind: "external"; icon: typeof IconSettings; label: string; href: string }

  const items: Item[] = [
    { kind: "button", icon: IconSettings, label: t("account"), onClick: () => { openDialog("account", { mobileView: "menu" }); onAction() } },
    { kind: "button", icon: IconCreditCard, label: t("credits.buy"), onClick: () => { openDialog("billing"); onAction() } },
    { kind: "link", icon: IconBook2, label: t("guide"), href: "/guide" },
    { kind: "link", icon: IconCompass, label: "Community", href: "/discover" },
    { kind: "link", icon: IconGift, label: t("inviteEarn"), href: "/referral" },
    { kind: "external", icon: IconVideo, label: t("talkToUs"), href: "https://cal.com/coasty/15min" },
  ]

  const rowClass = cn(
    "w-full flex items-center gap-2.5 px-2 rounded-md text-left transition-colors duration-100",
    "text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04] dark:hover:bg-white/[0.04]",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
    chrome === "drawer" ? "py-2.5" : "py-[7px]",
  )
  const rowPad = chrome === "drawer" ? "py-2.5" : "py-[7px]"

  const outerClass = cn(
    "overflow-hidden",
    chrome === "popover"
      ? "w-60 rounded-xl border border-border/60 bg-popover shadow-2xl dark:border-white/[0.06]"
      : "w-full",
  )

  const headerClass = cn(
    "flex items-center gap-3 border-b border-border/30 dark:border-white/[0.05]",
    chrome === "drawer" ? "px-3 pt-2 pb-3" : "px-3.5 pt-3.5 pb-3",
  )

  return (
    <div className={outerClass}>
      <div className={headerClass}>
        <Avatar className="h-9 w-9 ring-1 ring-border/40">
          <AvatarImage src={user.profile_image || undefined} />
          <AvatarFallback className="bg-foreground/[0.06] text-foreground text-[11px] font-semibold">
            {initialOf(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[12.5px] font-semibold text-foreground truncate leading-tight">
            {displayName}
          </span>
          {user.email && (
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

        {/* Theme — toggles in place without closing the menu. */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            setTheme(isDark ? "light" : "dark")
          }}
          aria-label="Toggle theme"
          className={cn(
            "w-full flex items-center gap-2.5 px-2 rounded-md text-left transition-colors duration-100",
            "text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04] dark:hover:bg-white/[0.04]",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
            rowPad,
          )}
        >
          {isDark ? <IconMoon size={14} stroke={1.5} className="shrink-0" /> : <IconSun size={14} stroke={1.5} className="shrink-0" />}
          <span className="text-[12px] font-medium flex-1 truncate">Theme</span>
          <span className="text-[10.5px] font-medium text-muted-foreground/60 capitalize tabular-nums">
            {themeReady ? (isDark ? "Dark" : "Light") : ""}
          </span>
        </button>
      </div>

      <div className="p-1.5 border-t border-border/30 dark:border-white/[0.05]">
        <button
          type="button"
          onClick={() => {
            signOut()
            onAction()
          }}
          className={cn(
            "w-full flex items-center gap-2.5 px-2 rounded-md text-left transition-colors duration-100",
            "text-muted-foreground/75 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/[0.06]",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
            rowPad,
          )}
        >
          <IconLogout size={14} stroke={1.5} className="shrink-0" />
          <span className="text-[12px] font-medium">Sign out</span>
        </button>
      </div>
    </div>
  )
}

// ─── Credits row ──────────────────────────────────────────────────
function CreditsRow({
  expanded,
  isMobile,
  closeMobileIfNeeded,
}: {
  expanded: boolean
  isMobile: boolean
  closeMobileIfNeeded: () => void
}) {
  const t = useTranslations("sidebar")
  const openDialog = useAccountDialog((s) => s.open)
  const { credits, loading } = useCredits()
  const { isUnlimitedPlan } = useSubscription()

  // Developer mode shows the dollar API wallet instead of consumer credits.
  // Mount-gated so the persisted mode never causes a hydration mismatch; the
  // wallet is only fetched when actually in developer mode.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const mode = usePlatformMode((s) => s.mode)
  const isDev = mounted && mode === "developer"
  const { wallet, loading: walletLoading } = useApiWallet(isDev)

  if (isDev) {
    const walletReady = !walletLoading && !!wallet
    const usd = wallet?.balanceUsd ?? 0
    const walletHealth: CreditHealth = usd <= 0 ? "depleted" : usd < 5 ? "low" : "healthy"
    const walletNumClass = walletHealth === "healthy" ? "text-foreground/85" : HEALTH_TEXT[walletHealth]

    const walletLabel = !walletReady ? (
      <span className="inline-block h-3 w-14 rounded bg-foreground/10 animate-pulse align-middle" />
    ) : (
      <span>
        <span className={cn("font-semibold tabular-nums", walletNumClass)}>${usd.toFixed(2)}</span>
        <span className="font-normal text-foreground/45"> wallet</span>
      </span>
    )

    const walletBtn = (
      <FooterRowButton
        expanded={expanded}
        icon={<IconWallet size={16} stroke={1.6} />}
        label={walletLabel}
        onClick={() => {
          openDialog("billing")
          if (isMobile) closeMobileIfNeeded()
        }}
      />
    )

    return collapsedTooltip(
      expanded,
      walletBtn,
      walletReady ? (
        <>
          <span className="font-semibold tabular-nums">${usd.toFixed(2)}</span>
          <span className="text-muted-foreground ml-1">API wallet</span>
        </>
      ) : (
        <span className="text-muted-foreground">…</span>
      ),
    )
  }

  const ready = !loading && !!credits
  const balance = credits?.balance ?? 0
  const totalPurchased = credits?.total_purchased ?? 0
  const health: CreditHealth = isUnlimitedPlan ? "healthy" : getHealth(balance, totalPurchased)
  // The amount IS the label here — a prominent number with a quiet
  // "credits" suffix (amber/rose only when low/depleted), or "Unlimited".
  const numClass = health === "healthy" ? "text-foreground/85" : HEALTH_TEXT[health]

  const label = !ready ? (
    <span className="inline-block h-3 w-14 rounded bg-foreground/10 animate-pulse align-middle" />
  ) : isUnlimitedPlan ? (
    <span className="font-semibold text-foreground/85">Unlimited</span>
  ) : (
    <span>
      <span className={cn("font-semibold tabular-nums", numClass)}>{balance.toLocaleString()}</span>
      <span className="font-normal text-foreground/45"> credits</span>
    </span>
  )

  const btn = (
    <FooterRowButton
      expanded={expanded}
      icon={isUnlimitedPlan ? <IconInfinity size={16} stroke={1.9} /> : <IconCoins size={16} stroke={1.6} />}
      label={label}
      onClick={() => {
        openDialog("billing")
        if (isMobile) closeMobileIfNeeded()
      }}
    />
  )

  return collapsedTooltip(
    expanded,
    btn,
    isUnlimitedPlan ? (
      <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
        <IconInfinity size={12} stroke={2.5} />
        Unlimited credits
      </span>
    ) : ready ? (
      <>
        <span className="font-semibold tabular-nums">{balance.toLocaleString()}</span>
        <span className="text-muted-foreground ml-1">{t("credits.creditsLeft")}</span>
      </>
    ) : (
      <span className="text-muted-foreground">…</span>
    ),
  )
}

// ─── Feedback row ─────────────────────────────────────────────────
function FeedbackRow({
  userId,
  expanded,
  isMobile,
}: {
  userId: string
  expanded: boolean
  isMobile: boolean
}) {
  const [open, setOpen] = useState(false)
  const icon = <IconMessage2 size={16} stroke={1.6} />

  if (isMobile) {
    return (
      <>
        <FooterRowButton
          expanded={expanded}
          icon={icon}
          label="Feedback"
          data-state={open ? "open" : "closed"}
          onClick={() => setOpen(true)}
        />
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="max-h-[82dvh] focus:outline-none rounded-t-2xl border-t border-border/40 dark:border-white/[0.06]">
            <DrawerTitle className="sr-only">Feedback</DrawerTitle>
            <div className="px-3 pb-2">
              <FeedbackComposeCard
                bare
                userId={userId}
                onCancel={() => setOpen(false)}
                onSent={() => setOpen(false)}
              />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  const trigger = (
    <PopoverTrigger asChild>
      <FooterRowButton expanded={expanded} icon={icon} label="Feedback" />
    </PopoverTrigger>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {collapsedTooltip(expanded, trigger, "Feedback")}
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
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

// ─── Run-locally row ──────────────────────────────────────────────
//   Sits right beside Feedback. A plain link to the desktop download —
//   so it's a Link (not a popover trigger) wrapped in the same ROW recipe.
function RunLocallyRow({
  expanded,
  closeMobileIfNeeded,
}: {
  expanded: boolean
  closeMobileIfNeeded: () => void
}) {
  const link = (
    <Link
      href="/download"
      target="_blank"
      rel="noopener noreferrer"
      onClick={closeMobileIfNeeded}
      aria-label="Run locally"
      className={ROW}
    >
      <RowInner
        icon={<IconDeviceDesktop size={16} stroke={1.6} />}
        label="Run locally"
        expanded={expanded}
      />
    </Link>
  )
  return collapsedTooltip(expanded, link, "Run locally")
}

// ─── Account row ──────────────────────────────────────────────────
function AccountRow({
  user,
  expanded,
  isMobile,
  closeMobileIfNeeded,
}: {
  user: NonNullable<UserLike>
  expanded: boolean
  isMobile: boolean
  closeMobileIfNeeded: () => void
}) {
  const t = useTranslations("sidebar")
  const [open, setOpen] = useState(false)
  const displayName = user.display_name || user.email?.split("@")[0] || t("user")

  const avatar = (
    <Avatar className="h-[20px] w-[20px] ring-1 ring-border/40">
      <AvatarImage src={user.profile_image || undefined} />
      <AvatarFallback className="bg-foreground/[0.06] text-foreground text-[9px] font-semibold">
        {initialOf(displayName)}
      </AvatarFallback>
    </Avatar>
  )

  const onAction = useCallback(() => {
    setOpen(false)
    closeMobileIfNeeded()
  }, [closeMobileIfNeeded])

  if (isMobile) {
    return (
      <>
        <FooterRowButton
          expanded={expanded}
          icon={avatar}
          iconClassName="justify-start overflow-visible"
          label={displayName}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-state={open ? "open" : "closed"}
          onClick={() => setOpen(true)}
        />
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="max-h-[82dvh] focus:outline-none rounded-t-2xl border-t border-border/40 dark:border-white/[0.06]">
            <DrawerTitle className="sr-only">Account menu</DrawerTitle>
            <div className="flex-1 min-h-0 overflow-y-auto pb-2">
              <AccountMenu chrome="drawer" user={user} onAction={onAction} />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  const trigger = (
    <PopoverTrigger asChild>
      <FooterRowButton
        expanded={expanded}
        icon={avatar}
        iconClassName="overflow-visible"
        label={displayName}
        aria-label="Open account menu"
      />
    </PopoverTrigger>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {collapsedTooltip(expanded, trigger, displayName)}
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-auto p-0 border-0 bg-transparent shadow-none"
      >
        <AccountMenu user={user} onAction={onAction} />
      </PopoverContent>
    </Popover>
  )
}

// ─── Standalone theme row (logged-out only) ───────────────────────
function ThemeRow({ expanded }: { expanded: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const isDark = resolvedTheme === "dark"
  const btn = (
    <FooterRowButton
      expanded={expanded}
      icon={isDark ? <IconMoon size={16} stroke={1.6} /> : <IconSun size={16} stroke={1.6} />}
      label="Theme"
      trailing={
        ready ? (
          <span className="text-[11px] font-medium text-foreground/45 capitalize">
            {isDark ? "Dark" : "Light"}
          </span>
        ) : null
      }
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    />
  )
  return collapsedTooltip(expanded, btn, "Theme")
}

// ═══════════════════════════════════════════════════════════════════
//  SidebarFooterSection
//  ─────────────────────
//  Three rows built from the nav row recipe — Credits, Feedback, Account
//  — and nothing else. No seam, no icon bar. Collapsed (48px) shows the
//  three icons with right-side tooltips; mobile swaps each menu to a
//  bottom Drawer. Theme and Run-locally live inside the account menu.
// ═══════════════════════════════════════════════════════════════════
export const SidebarFooterSection = memo(function SidebarFooterSection({
  user,
  expanded,
  isMobile,
  closeMobileIfNeeded,
}: {
  user: UserLike
  expanded: boolean
  isMobile: boolean
  closeMobileIfNeeded: () => void
}) {
  return (
    <div className="flex flex-col gap-0.5 pt-1 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
      {user && (
        <CreditsRow
          expanded={expanded}
          isMobile={isMobile}
          closeMobileIfNeeded={closeMobileIfNeeded}
        />
      )}

      {user?.id && (
        <FeedbackRow userId={user.id} expanded={expanded} isMobile={isMobile} />
      )}

      {user?.id && (
        <RunLocallyRow expanded={expanded} closeMobileIfNeeded={closeMobileIfNeeded} />
      )}

      {user ? (
        <AccountRow
          user={user}
          expanded={expanded}
          isMobile={isMobile}
          closeMobileIfNeeded={closeMobileIfNeeded}
        />
      ) : (
        <ThemeRow expanded={expanded} />
      )}
    </div>
  )
})
