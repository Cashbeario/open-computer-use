// @vitest-environment jsdom
/**
 * Windows-VM upload path regression guard.
 *
 * Bug: the VM file-upload code hardcoded the destination as the Linux-absolute
 * path `/home/desktop/Desktop/<file>`. On cloud Linux that only works because
 * the agent remaps `/home/desktop` -> `/home/ubuntu`; a Windows VM agent has
 * no such directory and no remap, so the upload lands nowhere valid and the
 * file never appears on the user's Desktop. The backend already standardized
 * on the OS-portable `~/Desktop` (resolved per-OS by the agent's
 * `os.path.expanduser`: `C:\Users\Administrator\Desktop` on Windows,
 * `/home/ubuntu/Desktop` on cloud Linux, `/home/desktop/Desktop` on Docker).
 * See backend/app/api/routes/file_operations.py:198-204,235-240.
 *
 * These tests pin the contract: the upload destination MUST be the portable
 * `~/Desktop/<name>` form, never the legacy Linux-absolute path that has no
 * valid resolution on a Windows VM. They fail against the pre-fix code for the
 * exact reason the Windows upload failed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// vm-file-handling imports the UI toast helper; stub it so the module loads in
// the test environment without a real DOM toast container.
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }))

import {
  uploadFileToVM,
  createVMOptimisticAttachments,
} from "@/lib/vm-file-handling"

const LEGACY_LINUX_PREFIX = "/home/desktop/Desktop/"

beforeEach(() => {
  // uploadFileToVM POSTs to /api/files?op=upload — capture the request body.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("VM upload destination is OS-portable (Windows VM fix)", () => {
  it("uploadFileToVM POSTs a `~/Desktop` filepath, not the Linux-absolute path", async () => {
    const file = new File(["hello"], "report.csv", { type: "text/csv" })

    const vmPath = await uploadFileToVM(file, "mch_windows_vm")

    // The returned path the rest of the app references must be portable.
    expect(vmPath).toBe("~/Desktop/report.csv")

    // And the path actually sent to the backend must be portable too — this is
    // the value the VM agent's os.path.expanduser resolves per-OS.
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const sentBody = JSON.parse((init as RequestInit).body as string)

    expect(sentBody.filepath).toBe("~/Desktop/report.csv")
    // The defect: a Linux-absolute path has no resolution on a Windows VM.
    expect(sentBody.filepath.startsWith(LEGACY_LINUX_PREFIX)).toBe(false)
    expect(sentBody.filepath.startsWith("~/")).toBe(true)
  })

  it("createVMOptimisticAttachments builds a `~/Desktop` vmPath", () => {
    const file = new File(["data"], "notes.txt", { type: "text/plain" })

    const [attachment] = createVMOptimisticAttachments([file])

    expect(attachment.vmPath).toBe("~/Desktop/notes.txt")
    expect(attachment.url).toBe("~/Desktop/notes.txt")
    expect(attachment.vmPath?.startsWith(LEGACY_LINUX_PREFIX)).toBe(false)
  })

  it("path traversal is still stripped before the portable prefix", async () => {
    // Sanitization must continue to run: the portable prefix must not become a
    // new way to smuggle a parent-traversal or absolute path.
    const evil = new File(["x"], "../../etc/passwd", { type: "text/plain" })

    const vmPath = await uploadFileToVM(evil, "mch_windows_vm")

    expect(vmPath).toBe("~/Desktop/passwd")
    expect(vmPath).not.toContain("..")
  })
})
