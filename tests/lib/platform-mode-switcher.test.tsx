// @vitest-environment jsdom
/**
 * PlatformModeSwitcher — interaction & accessibility coverage.
 *
 * Radix Popover is replaced with a tiny `open`-aware shim: jsdom doesn't
 * implement ResizeObserver / pointer capture that Radix's positioner needs,
 * and we only care here about the switcher's own logic (which mode shows,
 * open/close, selection wiring, a11y), not Radix's floating mechanics.
 *
 * The store is the REAL store so we exercise the genuine wiring end to end.
 */
import React from "react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
  act,
} from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

// ── Mock Radix popover: respects the controlled `open` prop ──────────────
vi.mock("@/components/ui/popover", () => {
  const Ctx = React.createContext<{
    open: boolean
    onOpenChange?: (o: boolean) => void
  }>({ open: false })
  return {
    Popover: ({ open, onOpenChange, children }: any) =>
      React.createElement(
        Ctx.Provider,
        { value: { open: !!open, onOpenChange } },
        children
      ),
    PopoverTrigger: ({ children }: any) => {
      const ctx = React.useContext(Ctx)
      return React.cloneElement(children, {
        "data-state": ctx.open ? "open" : "closed",
        onClick: (e: any) => {
          children.props?.onClick?.(e)
          ctx.onOpenChange?.(!ctx.open)
        },
      })
    },
    PopoverContent: ({ children }: any) => {
      const ctx = React.useContext(Ctx)
      return ctx.open
        ? React.createElement("div", { "data-testid": "popover-content" }, children)
        : null
    },
  }
})

// ── Mock tabler icons to inert spans (enumerate exactly what's imported) ──
vi.mock("@tabler/icons-react", () => {
  const Icon = (props: any) =>
    React.createElement("span", { "data-icon": true, ...props })
  return {
    IconSelector: Icon,
    IconCheck: Icon,
  }
})

import { PlatformModeSwitcher } from "@/app/components/layout/sidebar/platform-mode-switcher"
import { usePlatformMode, DEFAULT_PLATFORM_MODE } from "@/lib/platform-mode-store"

const trigger = () => screen.getByTestId("platform-mode-trigger")
const option = (id: "consumer" | "developer") =>
  screen.getByTestId(`platform-mode-option-${id}`)
const queryOption = (id: "consumer" | "developer") =>
  screen.queryByTestId(`platform-mode-option-${id}`)

beforeEach(() => {
  localStorage.clear()
  usePlatformMode.setState({ mode: DEFAULT_PLATFORM_MODE })
})
afterEach(() => cleanup())

describe("PlatformModeSwitcher", () => {
  describe("display", () => {
    it("shows the current mode on the trigger (consumer default)", () => {
      render(<PlatformModeSwitcher />)
      expect(trigger()).toHaveTextContent("Personal")
    })

    it("reflects developer mode coming from the store", () => {
      usePlatformMode.setState({ mode: "developer" })
      render(<PlatformModeSwitcher />)
      expect(trigger()).toHaveTextContent("Developer")
    })

    it("starts closed — no options rendered", () => {
      render(<PlatformModeSwitcher />)
      expect(queryOption("consumer")).not.toBeInTheDocument()
      expect(queryOption("developer")).not.toBeInTheDocument()
    })

    it("forwards an extra className while keeping base classes", () => {
      render(<PlatformModeSwitcher className="flex-1" />)
      expect(trigger()).toHaveClass("flex-1")
      expect(trigger()).toHaveClass("rounded-lg") // base survives cn() merge
    })
  })

  describe("opening", () => {
    it("opens on trigger click and shows both options", () => {
      render(<PlatformModeSwitcher />)
      fireEvent.click(trigger())
      expect(option("consumer")).toBeInTheDocument()
      expect(option("developer")).toBeInTheDocument()
    })

    it("exposes the two options inside a menu", () => {
      render(<PlatformModeSwitcher />)
      fireEvent.click(trigger())
      const menu = screen.getByRole("menu")
      expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(2)
    })

    it("marks only the active option as checked", () => {
      render(<PlatformModeSwitcher />)
      fireEvent.click(trigger())
      expect(option("consumer")).toHaveAttribute("aria-checked", "true")
      expect(option("developer")).toHaveAttribute("aria-checked", "false")
    })

    it("renders options + trigger as native, enabled buttons (keyboard-operable)", () => {
      render(<PlatformModeSwitcher />)
      expect(trigger().tagName).toBe("BUTTON")
      fireEvent.click(trigger())
      expect(option("consumer").tagName).toBe("BUTTON")
      expect(option("developer").tagName).toBe("BUTTON")
      expect(option("developer")).not.toBeDisabled()
    })

    it("toggles aria-expanded on the trigger", () => {
      render(<PlatformModeSwitcher />)
      expect(trigger()).toHaveAttribute("aria-expanded", "false")
      fireEvent.click(trigger())
      expect(trigger()).toHaveAttribute("aria-expanded", "true")
    })
  })

  describe("switching", () => {
    it("switches to developer: updates store, trigger, and closes", () => {
      render(<PlatformModeSwitcher />)
      fireEvent.click(trigger())
      fireEvent.click(option("developer"))
      expect(usePlatformMode.getState().mode).toBe("developer")
      expect(trigger()).toHaveTextContent("Developer")
      expect(queryOption("developer")).not.toBeInTheDocument() // closed
    })

    it("switches back to consumer", () => {
      usePlatformMode.setState({ mode: "developer" })
      render(<PlatformModeSwitcher />)
      fireEvent.click(trigger())
      fireEvent.click(option("consumer"))
      expect(usePlatformMode.getState().mode).toBe("consumer")
      expect(trigger()).toHaveTextContent("Personal")
    })

    it("clicking the already-active option is a no-op but still closes", () => {
      render(<PlatformModeSwitcher />)
      fireEvent.click(trigger())
      fireEvent.click(option("consumer"))
      expect(usePlatformMode.getState().mode).toBe("consumer")
      expect(queryOption("consumer")).not.toBeInTheDocument()
    })

    it("re-opening after a switch reflects the new active option", () => {
      render(<PlatformModeSwitcher />)
      fireEvent.click(trigger())
      fireEvent.click(option("developer"))
      fireEvent.click(trigger()) // reopen
      expect(option("developer")).toHaveAttribute("aria-checked", "true")
      expect(option("consumer")).toHaveAttribute("aria-checked", "false")
    })

    it("persists the switch to localStorage", () => {
      render(<PlatformModeSwitcher />)
      fireEvent.click(trigger())
      fireEvent.click(option("developer"))
      const raw = localStorage.getItem("coasty:platform-mode")
      expect(JSON.parse(raw as string).state.mode).toBe("developer")
    })
  })

  describe("reactivity & a11y", () => {
    it("reflects an external store change while mounted", () => {
      render(<PlatformModeSwitcher />)
      expect(trigger()).toHaveTextContent("Personal")
      act(() => {
        usePlatformMode.getState().setMode("developer")
      })
      expect(trigger()).toHaveTextContent("Developer")
    })

    it("has an accessible label naming the current platform", () => {
      render(<PlatformModeSwitcher />)
      expect(trigger()).toHaveAttribute(
        "aria-label",
        expect.stringContaining("Personal")
      )
      expect(trigger()).toHaveAttribute("aria-haspopup", "menu")
    })

    it("badges the developer option as Beta", () => {
      render(<PlatformModeSwitcher />)
      fireEvent.click(trigger())
      expect(within(option("developer")).getByText(/beta/i)).toBeInTheDocument()
      // consumer has no badge
      expect(within(option("consumer")).queryByText(/beta/i)).not.toBeInTheDocument()
    })
  })

  describe("multi-instance & rapid interaction", () => {
    it("keeps two mounted instances in sync (shared store)", () => {
      render(
        <>
          <PlatformModeSwitcher className="first" />
          <PlatformModeSwitcher className="second" />
        </>
      )
      expect(screen.getAllByTestId("platform-mode-trigger")).toHaveLength(2)
      // Switch via the first instance...
      fireEvent.click(screen.getAllByTestId("platform-mode-trigger")[0])
      fireEvent.click(screen.getAllByTestId("platform-mode-option-developer")[0])
      // ...both triggers reflect the shared store.
      for (const t of screen.getAllByTestId("platform-mode-trigger")) {
        expect(t).toHaveTextContent("Developer")
      }
    })

    it("survives rapid open / close / re-select without leaking open state", () => {
      render(<PlatformModeSwitcher />)
      fireEvent.click(trigger()) // open
      fireEvent.click(trigger()) // close
      expect(queryOption("developer")).not.toBeInTheDocument()
      fireEvent.click(trigger()) // open
      fireEvent.click(option("developer")) // select + close
      expect(usePlatformMode.getState().mode).toBe("developer")
      expect(queryOption("developer")).not.toBeInTheDocument()
      fireEvent.click(trigger()) // open again
      fireEvent.click(option("consumer")) // select + close
      expect(usePlatformMode.getState().mode).toBe("consumer")
      expect(queryOption("consumer")).not.toBeInTheDocument()
    })
  })
})
