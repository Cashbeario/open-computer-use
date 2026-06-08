"use client"

import { motion } from "framer-motion"
import {
  EASE,
  TracesPanel,
  useDeveloperData,
  DevPageShell,
  DevHeader,
} from "@/app/components/developers/developers-shared"

/* ===================================================================
   Logs page — every API request as a filterable, exportable trace
   (endpoint, credits, timing, request_id). Search, time-range, endpoint
   filters, live auto-refresh, and CSV/JSON export all live in TracesPanel.
   =================================================================== */

export function LogsContent() {
  const { recent, loading, refetch } = useDeveloperData()

  return (
    <DevPageShell loading={loading}>
      <DevHeader
        title="Logs"
        description="Inspect every API request: endpoints, credits, timing, and request IDs."
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: EASE }}
      >
        <TracesPanel recent={recent} onRefresh={refetch} />
      </motion.div>
    </DevPageShell>
  )
}
