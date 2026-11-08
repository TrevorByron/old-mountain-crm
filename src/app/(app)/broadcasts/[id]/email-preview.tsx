"use client"

import { useEffect, useRef, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const HIGHLIGHT_STYLE = `
  [data-block-id] { cursor: pointer; }
  [data-block-id]:hover { outline: 2px dashed #c4a96b; outline-offset: -2px; }
  [data-block-id][data-selected] { outline: 2px solid #476b35; outline-offset: -2px; }
`

const DEVICE_WIDTHS = { desktop: 640, mobile: 375 }

function swapBody(doc: Document, html: string) {
  const next = new DOMParser().parseFromString(html, "text/html")
  doc.body.innerHTML = next.body.innerHTML
  doc.body.setAttribute("style", next.body.getAttribute("style") ?? "")
}

// Same-origin so the editor can reach in for click-to-select, and so the browser doesn't
// treat the frame as an outside site and block its images. Scripts in the email can't run.
export function EmailPreview({
  html,
  selectedId,
  onSelect,
}: {
  html: string
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const loaded = useRef(false)
  const latestHtml = useRef(html)
  const selected = useRef(selectedId)
  const select = useRef(onSelect)
  const [device, setDevice] = useState<keyof typeof DEVICE_WIDTHS>("desktop")
  const [firstHtml, setFirstHtml] = useState(html)
  const [size, setSize] = useState({ width: 0, height: 0 })

  // The frame only loads once. After that its contents are swapped in place, so typing
  // doesn't flash the preview or lose its scroll position.
  if (!firstHtml && html) setFirstHtml(html)

  function highlight() {
    const doc = frame.current?.contentDocument
    if (!doc) return
    doc.querySelectorAll("[data-selected]").forEach((element) => element.removeAttribute("data-selected"))
    if (selected.current) {
      doc.querySelector(`[data-block-id="${CSS.escape(selected.current)}"]`)?.setAttribute("data-selected", "")
    }
  }

  useEffect(() => {
    select.current = onSelect
  })

  useEffect(() => {
    selected.current = selectedId
    highlight()
    if (selectedId) {
      frame.current?.contentDocument
        ?.querySelector(`[data-block-id="${CSS.escape(selectedId)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [selectedId])

  useEffect(() => {
    latestHtml.current = html
    const doc = frame.current?.contentDocument
    if (!html || !loaded.current || !doc) return
    swapBody(doc, html)
    highlight()
  }, [html])

  useEffect(() => {
    if (!area.current) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(area.current)
    return () => observer.disconnect()
  }, [])

  function onLoad() {
    const doc = frame.current?.contentDocument
    if (!doc || !firstHtml) return
    loaded.current = true

    const style = doc.createElement("style")
    style.textContent = HIGHLIGHT_STYLE
    doc.head.append(style)
    doc.addEventListener("click", (event) => {
      event.preventDefault()
      const block = (event.target as Element).closest?.("[data-block-id]")
      const id = block?.getAttribute("data-block-id")
      if (id) select.current(id)
    })
    if (latestHtml.current) swapBody(doc, latestHtml.current)
    highlight()
  }

  // Lays the email out at its real width, then scales it to fit, so "Desktop" stays true
  // to what a desktop inbox shows even in a narrow panel.
  const width = DEVICE_WIDTHS[device]
  const scale = size.width > 0 ? Math.min(1, size.width / width) : 1

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 md:pl-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          variant="outline"
          aria-label="Preview width"
          value={[device]}
          onValueChange={(value: string[]) => {
            if (value[0] === "desktop" || value[0] === "mobile") setDevice(value[0])
          }}
        >
          <ToggleGroupItem value="desktop">Desktop</ToggleGroupItem>
          <ToggleGroupItem value="mobile">Mobile</ToggleGroupItem>
        </ToggleGroup>
        <span className="text-xs text-muted-foreground">Click anything to edit it</span>
      </div>
      <div ref={area} className="relative min-h-[32rem] flex-1 overflow-hidden rounded-lg border bg-white md:min-h-0">
        {!firstHtml && <Skeleton className="absolute inset-4" />}
        {firstHtml && (
          <iframe
            ref={frame}
            title="Email preview"
            sandbox="allow-same-origin"
            srcDoc={firstHtml}
            onLoad={onLoad}
            className="absolute top-0 border-0 bg-white"
            style={{
              height: size.height / scale,
              left: Math.max(0, (size.width - width * scale) / 2),
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width,
            }}
          />
        )}
      </div>
    </div>
  )
}
