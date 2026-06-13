"use client"

import { useState } from "react"
import { Download, Eye, X, Paperclip, File } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { formatFileSize, getFileSizeColor } from "@/lib/utils/format-file-size"
import { toast } from "@/components/ui/toast"
import Image from "next/image"

interface FileAttachment {
  name: string
  type?: string
  size?: number
  vmPath?: string
  url?: string
  content?: string
}

interface FileAttachmentDisplayProps {
  attachments: FileAttachment[]
  machineId?: string | null
  className?: string
}

// Use the imported formatFileSize instead of local implementation
// Removed local formatFileSize function as we're using the utility

const getFileExtension = (filename?: string) => {
  if (!filename) return "FILE"
  const ext = filename.split('.').pop()?.toUpperCase()
  return ext || "FILE"
}

const isImageFile = (filename?: string, type?: string) => {
  if (type?.startsWith('image/')) return true
  const ext = filename?.split('.').pop()?.toLowerCase()
  return ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
}

export function FileAttachmentDisplay({ 
  attachments, 
  machineId,
  className 
}: FileAttachmentDisplayProps) {
  const [viewingFile, setViewingFile] = useState<FileAttachment | null>(null)
  const [fileContent, setFileContent] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  
  console.log('FileAttachmentDisplay - Received attachments:', attachments)
  console.log('FileAttachmentDisplay - Machine ID:', machineId)

  const handleViewFile = async (attachment: FileAttachment) => {
    if (!machineId || machineId === "none") {
      toast({
        title: "Cannot view file",
        description: "No virtual machine selected",
        status: "error"
      })
      return
    }

    setViewingFile(attachment)
    setIsLoading(true)
    setFileContent("")

    try {
      // Fetch file content from VM
      const response = await fetch('/api/files?op=download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: machineId,
          filepath: attachment.vmPath || `~/Desktop/${attachment.name}`,
          encoding: 'auto'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to fetch file')
      }

      const data = await response.json()
      console.log('FileViewer - Response from backend:', data)
      
      if (data.success && data.content) {
        // Check file extension for better type detection
        const ext = attachment.name?.split('.').pop()?.toLowerCase()
        const isTextFile = ext && ['txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'log', 'ini', 'cfg', 'conf', 
                                    'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 
                                    'php', 'rb', 'sh', 'bat', 'ps1', 'html', 'css', 'sql'].includes(ext)
        
        console.log('FileViewer - File:', attachment.name, 'Extension:', ext, 'IsText:', isTextFile, 'Encoding:', data.encoding)
        
        if (data.encoding === 'base64') {
          // Check if it's an image file
          if (isImageFile(attachment.name, attachment.type)) {
            // Keep base64 content for image display
            setFileContent(data.content)
            console.log('FileViewer - Keeping base64 for image display')
          } else if (isTextFile || attachment.type?.startsWith('text/')) {
            // Try to decode base64 for text files
            try {
              const decoded = atob(data.content)
              setFileContent(decoded)
              console.log('FileViewer - Successfully decoded base64 content')
            } catch (e) {
              console.error('FileViewer - Failed to decode base64:', e)
              // If it's supposed to be text but decode failed, show raw content
              setFileContent(data.content)
            }
          } else {
            // Other binary files - keep base64 for potential use
            setFileContent(data.content)
          }
        } else {
          // UTF-8 or other text encoding
          setFileContent(data.content)
        }
      }
    } catch (error) {
      console.error('Error fetching file:', error)
      toast({
        title: "Failed to load file",
        description: error instanceof Error ? error.message : "Unknown error",
        status: "error"
      })
      setFileContent("Failed to load file content")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadFile = async (attachment: FileAttachment) => {
    if (!machineId || machineId === "none") {
      toast({
        title: "Cannot download file",
        description: "No virtual machine selected",
        status: "error"
      })
      return
    }

    try {
      const response = await fetch('/api/files?op=download-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: machineId,
          filepath: attachment.vmPath || `~/Desktop/${attachment.name}`
        })
      })

      if (!response.ok) {
        throw new Error('Failed to download file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast({
        title: "File downloaded",
        description: `${attachment.name} has been downloaded`,
        status: "success"
      })
    } catch (error) {
      console.error('Error downloading file:', error)
      toast({
        title: "Failed to download file",
        description: error instanceof Error ? error.message : "Unknown error",
        status: "error"
      })
    }
  }

  if (!attachments || attachments.length === 0) {
    console.log('FileAttachmentDisplay - No attachments to display')
    return null
  }

  console.log('FileAttachmentDisplay - Rendering', attachments.length, 'attachments')
  
  return (
    <div className={cn("flex flex-col gap-2 mb-3", className)}>
      <div className="flex flex-row gap-2 overflow-x-auto justify-end">
        {attachments.map((attachment, index) => {
          const ext = getFileExtension(attachment.name)
          const isImage = isImageFile(attachment.name, attachment.type)
          
          return (
            <div
              key={`${attachment.name}-${index}`}
              className="relative flex-shrink-0 w-[180px]"
            >
              <div 
                className="bg-background hover:bg-accent border-input flex items-center gap-3 rounded-2xl border p-2 pr-3 transition-colors cursor-pointer"
                onClick={() => handleViewFile(attachment)}
              >
                <div className="bg-accent-foreground/10 flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md">
                  {isImage && attachment.url ? (
                    <Image
                      src={attachment.url}
                      alt={attachment.name}
                      width={40}
                      height={40}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full w-full">
                      <span className="text-center text-xs text-gray-400">
                        {ext}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col overflow-hidden flex-1">
                  <span className="truncate text-xs font-medium">{attachment.name}</span>
                  <span className={cn("text-xs", attachment.size ? getFileSizeColor(attachment.size) : "text-gray-500")}>
                    {formatFileSize(attachment.size) || "Unknown size"}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 rounded hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDownloadFile(attachment)
                  }}
                  title="Download file"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <Dialog open={!!viewingFile} onOpenChange={(open) => !open && setViewingFile(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <File className="h-4 w-4" />
              {viewingFile?.name}
              {viewingFile?.size && (
                <span className="text-sm text-muted-foreground ml-2">
                  ({formatFileSize(viewingFile.size)})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="h-[60vh] w-full rounded-md border p-4 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-muted-foreground">Loading file content...</div>
              </div>
            ) : isImageFile(viewingFile?.name, viewingFile?.type) && fileContent && !fileContent.startsWith("[") ? (
              <div className="flex justify-center items-center h-full">
                <img
                  src={`data:image/${viewingFile?.name?.split('.').pop()?.toLowerCase() || 'png'};base64,${fileContent}`}
                  alt={viewingFile?.name}
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => {
                    console.error('Image failed to load');
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).insertAdjacentHTML('afterend',
                      '<div class="text-center text-muted-foreground">Failed to display image. Try downloading the file instead.</div>'
                    );
                  }}
                />
              </div>
            ) : viewingFile?.name?.endsWith('.pdf') ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="text-muted-foreground">PDF preview is not available</div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDownloadFile(viewingFile!)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            ) : viewingFile?.name?.endsWith('.csv') ? (
              <div className="w-full overflow-auto">
                <pre className="text-sm font-mono whitespace-pre">
                  {fileContent}
                </pre>
              </div>
            ) : fileContent && (fileContent.length > 1000 && /^[A-Za-z0-9+/]+=*$/.test(fileContent)) ? (
              // Likely base64 encoded binary file
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="text-muted-foreground">
                  This appears to be a binary file and cannot be displayed as text
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDownloadFile(viewingFile!)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
            ) : (
              <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                {fileContent}
              </pre>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDownloadFile(viewingFile!)}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setViewingFile(null)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}