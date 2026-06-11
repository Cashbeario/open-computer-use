/**
 * Coding-agent config — what the developer codes with, the integration they
 * want generated, and what they are building. Captured by the "Coding Agent
 * Quickstart" popup and persisted so later surfaces (recommendations, tailored
 * docs, sample picks) can read it without re-asking.
 *
 * Single source of truth, persisted to localStorage. Side-effect free: setting a
 * field never navigates or fetches; it only records the choice. A future
 * server-side sync can read `useCodingAgentConfig.getState()` and POST it.
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"

export const CODING_AGENT_STORAGE_KEY = "coasty:coding-agent-config"

export interface CodingAgentConfig {
  /** Which coding tool the developer uses (id from CODING_AGENTS). */
  codingAgent: string
  /** Free-text value when codingAgent === "other". */
  customAgent: string
  /** The integration/language the prompt should generate (id from INTEGRATIONS). */
  integration: string
  customIntegration: string
  /** What the developer is building (id from BUILD_TARGETS). */
  building: string
  customBuilding: string
  /**
   * Where generated code should run (id from EXECUTION_TARGET_OPTIONS):
   * "local" — automate the developer's OWN screen (screenshot loop +
   * pyautogui/Playwright execution, no VM); "cloud-vm" — a Coasty-managed
   * machine via /v1/machines + /v1/runs. LOCAL IS THE DEFAULT everywhere;
   * persisted, so an explicit cloud-vm pick sticks for later prompts.
   */
  executionTarget: string
  /** ISO timestamp set the first time the user acts on a config (copy / open). */
  configuredAt: string | null
}

const DEFAULT_CONFIG: CodingAgentConfig = {
  codingAgent: "cursor",
  customAgent: "",
  integration: "python",
  customIntegration: "",
  building: "",
  customBuilding: "",
  executionTarget: "local",
  configuredAt: null,
}

interface CodingAgentState extends CodingAgentConfig {
  setCodingAgent: (v: string) => void
  setCustomAgent: (v: string) => void
  setIntegration: (v: string) => void
  setCustomIntegration: (v: string) => void
  setBuilding: (v: string) => void
  setCustomBuilding: (v: string) => void
  setExecutionTarget: (v: string) => void
  /** Mark that the user committed to this config (used to gate recommendations). */
  markConfigured: () => void
  reset: () => void
}

export const useCodingAgentConfig = create<CodingAgentState>()(
  persist(
    (set) => ({
      ...DEFAULT_CONFIG,
      setCodingAgent: (v) => set({ codingAgent: v }),
      setCustomAgent: (v) => set({ customAgent: v }),
      setIntegration: (v) => set({ integration: v }),
      setCustomIntegration: (v) => set({ customIntegration: v }),
      setBuilding: (v) => set({ building: v }),
      setCustomBuilding: (v) => set({ customBuilding: v }),
      setExecutionTarget: (v) => set({ executionTarget: v }),
      markConfigured: () => set({ configuredAt: new Date().toISOString() }),
      reset: () => set({ ...DEFAULT_CONFIG }),
    }),
    {
      name: CODING_AGENT_STORAGE_KEY,
      version: 1,
      // Persist only the data, never the action functions.
      partialize: (s) => ({
        codingAgent: s.codingAgent,
        customAgent: s.customAgent,
        integration: s.integration,
        customIntegration: s.customIntegration,
        building: s.building,
        customBuilding: s.customBuilding,
        executionTarget: s.executionTarget,
        configuredAt: s.configuredAt,
      }),
    },
  ),
)
