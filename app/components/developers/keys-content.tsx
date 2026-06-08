"use client"

import { useEffect, useMemo, useState } from "react"
import { BuildWithAIBar } from "@/app/components/developers/copy-for-ai"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Search, X, Shield, Key, BookOpen } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { fetchClient } from "@/lib/fetch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  EASE,
  type KeyKind,
  APIKeyCard,
  CreateKeyDialog,
  CreatedKeyDialog,
  useDeveloperData,
  DevPageShell,
  DevHeader,
} from "@/app/components/developers/developers-shared"

/* ===================================================================
   API keys page — create, search, filter, reveal, and revoke the keys
   that authenticate API requests. The only developer page with write
   actions; create/revoke mutations live here, the read lives in the
   shared useDeveloperData hook.
   =================================================================== */

export function KeysContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { keys, setKeys, loading, refetch } = useDeveloperData()

  const [creating, setCreating] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [rawKeys, setRawKeys] = useState<Record<string, string>>({})
  const [keySearch, setKeySearch] = useState("")
  const [keyKindFilter, setKeyKindFilter] = useState<"all" | KeyKind>("all")

  // Deep-link: arriving with ?new=1 (the sidebar's "New API key" CTA in
  // Developer mode) opens the create dialog immediately, then strips the param
  // so a refresh or back-nav doesn't reopen it. Reacts to searchParams so it
  // also fires when already on this page (same-route query change).
  useEffect(() => {
    if (searchParams.get("new") !== null) {
      setShowCreateDialog(true)
      router.replace(pathname, { scroll: false })
    }
  }, [searchParams, pathname, router])

  const createKey = async ({ name, kind, scopes }: { name: string; kind: KeyKind; scopes: string[] }) => {
    setCreating(true)
    try {
      const res = await fetchClient("/api/developers", {
        method: "POST",
        body: JSON.stringify({ name, kind, scopes }),
      })
      if (res.ok) {
        const data = await res.json()
        setCreatedKey(data.key)
        setRawKeys(prev => ({ ...prev, [data.key_id]: data.key }))
        setShowCreateDialog(false)
        refetch()
        toast.success(`${kind === "test" ? "Test" : "Live"} key created`)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err?.error?.message ?? "Failed to create key")
      }
    } catch {
      toast.error("Failed to create key")
    } finally {
      setCreating(false)
    }
  }

  const revokeKey = async (id: string) => {
    try {
      const res = await fetchClient(`/api/developers/${id}`, { method: "DELETE" })
      if (res.ok) {
        setKeys(prev => prev.filter(k => k.id !== id))
        setRevokeId(null)
        toast.success("API key revoked")
      } else {
        toast.error("Failed to revoke key")
      }
    } catch {
      toast.error("Failed to revoke key")
    }
  }

  const filteredKeys = useMemo(() => {
    const q = keySearch.trim().toLowerCase()
    return keys.filter(k => {
      const isTest = k.key_prefix.startsWith("sk-coasty-test-")
      if (keyKindFilter === "live" && isTest) return false
      if (keyKindFilter === "test" && !isTest) return false
      if (q) {
        const hay = `${k.name} ${k.key_prefix}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [keys, keySearch, keyKindFilter])

  return (
    <DevPageShell loading={loading}>
      <DevHeader
        title="API keys"
        description="Create and manage the keys that authenticate your API requests."
        actions={
          <>
            <Link
              href="/developers/docs"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-foreground/[0.08] text-[12.5px] font-medium text-muted-foreground/70 hover:text-foreground hover:border-foreground/20 hover:bg-foreground/[0.03] transition-all"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Docs
            </Link>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex h-9 items-center justify-center rounded-xl px-4 text-[12.5px] font-medium gap-1.5 transition-all bg-foreground text-background hover:bg-foreground/90 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Create key
            </button>
          </>
        }
      />

      <BuildWithAIBar />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: EASE }}
      >
        {keys.length === 0 ? (
          /* ── Empty state — restrained, single CTA ── */
          <div className="relative rounded-2xl border border-foreground/[0.06] bg-foreground/[0.015] dark:bg-foreground/[0.02] overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-12 right-1/4 h-56 w-56 rounded-full bg-foreground/[0.02] blur-3xl" />
              <div className="absolute -bottom-12 left-1/4 h-48 w-48 rounded-full bg-foreground/[0.02] blur-3xl" />
            </div>

            <div className="relative flex flex-col items-center py-16 px-6 text-center">
              <div className="relative h-12 w-12 mb-6 flex items-center justify-center">
                <div className="absolute inset-0 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03]" />
                <Key className="relative h-5 w-5 text-foreground/55" strokeWidth={1.6} />
                <motion.span
                  className="absolute inset-0 rounded-2xl border border-foreground/15"
                  animate={{ opacity: [0, 0.6, 0], scale: [1, 1.18, 1.32] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                />
              </div>

              <div className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground/45 mb-2">
                Get started
              </div>
              <h3 className="text-[18px] sm:text-[20px] font-medium tracking-tight mb-2">No API keys yet</h3>
              <p className="text-[13px] text-muted-foreground/60 max-w-sm mb-7 leading-relaxed">
                Create a key to start sending screenshots and receiving structured automation actions.
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-medium transition-all text-background bg-foreground hover:bg-foreground/90 shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create your first key
                </button>
                <Link
                  href="/developers/docs"
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-foreground/[0.08] text-[12.5px] font-medium text-muted-foreground/70 hover:text-foreground hover:border-foreground/20 transition-all"
                >
                  Read the docs
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Search + kind filter toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                <input
                  type="text"
                  value={keySearch}
                  onChange={e => setKeySearch(e.target.value)}
                  placeholder="Search by name or prefix"
                  className="w-full h-8 pl-8 pr-7 rounded-lg text-[12px] bg-background/60 border border-foreground/[0.08] placeholder:text-muted-foreground/35 text-foreground/85 focus:outline-none focus:border-foreground/20 focus:bg-background transition-colors"
                />
                {keySearch && (
                  <button
                    onClick={() => setKeySearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="inline-flex items-center rounded-lg border border-foreground/[0.08] bg-background/60 p-0.5">
                {([
                  { id: "all" as const, label: "All" },
                  { id: "live" as const, label: "Live" },
                  { id: "test" as const, label: "Test" },
                ]).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setKeyKindFilter(opt.id)}
                    className={cn(
                      "h-7 px-3 rounded-md text-[11px] font-medium transition-colors",
                      keyKindFilter === opt.id
                        ? "bg-foreground/[0.08] dark:bg-foreground/[0.12] text-foreground"
                        : "text-muted-foreground/55 hover:text-foreground/80",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto text-[10.5px] text-muted-foreground/35 tabular-nums">
                {filteredKeys.length === keys.length
                  ? `${keys.length} key${keys.length !== 1 ? "s" : ""}`
                  : `${filteredKeys.length} of ${keys.length}`}
              </div>
            </div>

            {/* Keys grid */}
            {filteredKeys.length === 0 ? (
              <div className="relative rounded-2xl border border-foreground/[0.06] bg-foreground/[0.015] dark:bg-foreground/[0.02] overflow-hidden px-5 py-10 text-center">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />
                <p className="text-[12px] text-muted-foreground/45">No keys match your filters.</p>
                <button
                  onClick={() => { setKeySearch(""); setKeyKindFilter("all") }}
                  className="mt-2 text-[11px] font-medium text-foreground/70 hover:text-foreground underline-offset-2 hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AnimatePresence initial={false}>
                  {filteredKeys.map((k, i) => (
                    <APIKeyCard
                      key={k.id}
                      apiKey={k}
                      index={i}
                      fullKey={rawKeys[k.id]}
                      onRevoke={(id) => setRevokeId(id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Footnote about test keys */}
            <div className="flex items-start gap-2 px-1 pt-1">
              <Shield className="h-3 w-3 text-muted-foreground/30 mt-0.5 shrink-0" />
              <p className="text-[10.5px] text-muted-foreground/45 leading-relaxed">
                Test keys (<code className="font-mono text-[10px]">sk-coasty-test-…</code>) return mock responses without billing your balance. Use them for local development and CI.
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Create dialog ── */}
      <CreateKeyDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={createKey}
        creating={creating}
      />

      {/* ── Created-key dialog ── */}
      <CreatedKeyDialog
        createdKey={createdKey}
        onClose={() => setCreatedKey(null)}
        onViewDocs={() => { setCreatedKey(null); router.push("/developers/docs") }}
      />

      {/* ── Revoke confirm ── */}
      <AlertDialog open={!!revokeId} onOpenChange={(o) => !o && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key</AlertDialogTitle>
            <AlertDialogDescription>
              This key will immediately stop working. Any applications using it will fail. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeId && revokeKey(revokeId)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DevPageShell>
  )
}
