"use client"

import { create } from "zustand"

/**
 * Global open/close store for the sidebar's "Memory" quick-edit popup.
 *
 * Why a store and not local React state?
 *   The Memory entry lives inside `SidebarNavSection`, which is mounted
 *   *inside* the mobile sidebar's `<AnimatePresence>` tree. When the
 *   user taps Memory on mobile we open the dialog AND close the sidebar
 *   (so the dialog isn't covered by the rail). The sidebar's exit
 *   animation unmounts its entire subtree ~320ms later — including the
 *   `SidebarNavSection` instance and the dialog it owns — which made
 *   the dialog blink open and then vanish, reading as "the popup is
 *   opening behind the sidebar".
 *   Hoisting the open/close state into a tiny global store, and
 *   mounting the dialog itself at the `AppSidebar` root (a sibling of
 *   the `Sidebar`, not a child), decouples the dialog lifecycle from
 *   the sidebar's mount/unmount cycle. Same pattern as the existing
 *   `useAccountDialog` store.
 */
interface MemoryDialogStore {
  isOpen: boolean
  open: () => void
  close: () => void
  setOpen: (next: boolean) => void
}

export const useMemoryDialog = create<MemoryDialogStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setOpen: (next) => set({ isOpen: next }),
}))
