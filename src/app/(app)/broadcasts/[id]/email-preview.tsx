"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useIsMobile } from "@/hooks/use-mobile"

const HIGHLIGHT_STYLE = `
  html, body { overflow: hidden; }
  [data-block-id] { cursor: pointer; }
  [data-block-id]:hover { outline: 2px dashed #c4a96b; outline-offset: -2px; }
  [data-block-id][data-selected] { outline: 2px solid #111100; outline-offset: -2px; }
`

const DEVICE_WIDTHS = { desktop: 640, mobile: 375 }
const TOOLBAR_ROOM = 140

// Where the selected block sits inside the email, in the email's own pixels.
export type BlockFrame = {
  top: number
  left: number
  width: number
  height: number
  padding: string
  background: string
}

function swapBody(doc: Document, html: string) {
  const next = new DOMParser().parseFromString(html, "text/html")
  doc.body.innerHTML = next.body.innerHTML
  doc.body.setAttribute("style", next.body.getAttribute("style") ?? "")
}

function sameFrame(a: BlockFrame | null, b: BlockFrame | null) {
  return JSON.stringify(a) === JSON.stringify(b)
}

// Same-origin so the editor can reach in for click-to-select, and so the browser doesn't
// treat the frame as an outside site and block its images. Scripts in the email can't run.
// The frame is as tall as the email, so the page scrolls and tools can sit on top of a block.
export function EmailPreview({
  html,
  selectedId,
  onSelect,
  toolbar,
  onBlock,
}: {
  html: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  // Floats over the selected block, at the page's own size.
  toolbar?: ReactNode
  // Laid over the selected block at the email's size, for writing straight onto it.
  onBlock?: (frame: BlockFrame) => ReactNode
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const loaded = useRef(false)
  const latestHtml = useRef(html)
  const selected = useRef(selectedId)
  const select = useRef(onSelect)
  // Phones start on the phone-sized email, so the words are big enough to write in.
  const isMobile = useIsMobile()
  const [chosenDevice, setDevice] = useState<keyof typeof DEVICE_WIDTHS | null>(null)
  const device = chosenDevice ?? (isMobile ? "mobile" : "desktop")
  const [firstHtml, setFirstHtml] = useState(html)
  const [areaWidth, setAreaWidth] = useState(0)
  const [contentHeight, setContentHeight] = useState(0)
  const [blockFrame, setBlockFrame] = useState<BlockFrame | null>(null)

  // The frame only loads once. After that its contents are swapped in place, so typing
  // doesn't flash the preview.
  if (!firstHtml && html) setFirstHtml(html)

  function measure() {
    const doc = frame.current?.contentDocument
    if (!doc?.body) return
    setContentHeight(doc.documentElement.scrollHeight)
    const element = selected.current ? doc.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(selected.current)}"]`) : null
    if (!element) {
      setBlockFrame(null)
      return
    }
    const rect = element.getBoundingClientRect()
    const style = doc.defaultView?.getComputedStyle(element)
    // A block with no color of its own shows the paper behind it.
    const paper = element.parentElement?.closest("table[style*='max-width']") ?? doc.body
    const own = style?.backgroundColor
    const background =
      own && own !== "rgba(0, 0, 0, 0)" ? own : (doc.defaultView?.getComputedStyle(paper).backgroundColor ?? "#ffffff")
    const next = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      padding: style?.padding ?? "0px",
      background,
    }
    setBlockFrame((current) => (sameFrame(current, next) ? current : next))
  }
  const measureRef = useRef(measure)

  function highlight() {
    const doc = frame.current?.contentDocument
    if (!doc) return
    doc.querySelectorAll("[data-selected]").forEach((element) => element.removeAttribute("data-selected"))
    if (selected.current) {
      doc.querySelector(`[data-block-id="${CSS.escape(selected.current)}"]`)?.setAttribute("data-selected", "")
    }
    measure()
  }

  useEffect(() => {
    select.current = onSelect
    measureRef.current = measure
  })

  useEffect(() => {
    selected.current = selectedId
    highlight()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, device])

  useEffect(() => {
    latestHtml.current = html
    const doc = frame.current?.contentDocument
    if (!html || !loaded.current || !doc) return
    swapBody(doc, html)
    highlight()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html])

  useEffect(() => {
    if (!area.current) return
    const observer = new ResizeObserver(([entry]) => setAreaWidth(entry.contentRect.width))
    observer.observe(area.current)
    return () => observer.disconnect()
  }, [])

  function onLoad() {
    const doc = frame.current?.contentDocument
    const view = frame.current?.contentWindow as (Window & typeof globalThis) | null
    if (!doc || !view || !firstHtml) return
    loaded.current = true

    const style = doc.createElement("style")
    style.textContent = HIGHLIGHT_STYLE
    doc.head.append(style)
    doc.addEventListener("click", (event) => {
      event.preventDefault()
      const block = (event.target as Element).closest?.("[data-block-id]")
      select.current(block?.getAttribute("data-block-id") ?? null)
    })
    // Photos finishing loading change the email's height, and the selected block's place.
    new view.ResizeObserver(() => measureRef.current()).observe(doc.body)
    if (latestHtml.current) swapBody(doc, latestHtml.current)
    highlight()
  }

  // Lays the email out at its real width, then scales it to fit, so "Desktop" stays true
  // to what a desktop inbox shows even on a narrow screen.
  const width = DEVICE_WIDTHS[device]
  const scale = areaWidth > 0 ? Math.min(1, areaWidth / width) : 1
  const offset = Math.max(0, (areaWidth - width * scale) / 2)
  const height = Math.max(contentHeight, 320)

  // Above the block when there's room, otherwise just under its top edge.
  const toolbarAbove = blockFrame ? blockFrame.top * scale > TOOLBAR_ROOM : true
  const toolbarTop = blockFrame ? (toolbarAbove ? blockFrame.top * scale - 8 : (blockFrame.top + blockFrame.height) * scale + 8) : 0

  return (
    <div className="flex flex-col gap-3">
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
        <span className="text-xs text-muted-foreground">Click anything in the email to edit it</span>
      </div>
      <div ref={area} className="relative" style={{ height: height * scale }}>
        {!firstHtml && <Skeleton className="absolute inset-0" />}
        {firstHtml && (
          <div
            className="absolute top-0 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-foreground/5"
            style={{ height, left: offset, transform: `scale(${scale})`, transformOrigin: "top left", width }}
          >
            <iframe
              ref={frame}
              title="Email preview"
              sandbox="allow-same-origin"
              srcDoc={firstHtml}
              onLoad={onLoad}
              scrolling="no"
              className="block border-0 bg-white"
              style={{ height, width }}
            />
            {blockFrame && onBlock && (
              <div
                data-block-editing=""
                className="absolute"
                style={{
                  background: blockFrame.background,
                  left: blockFrame.left,
                  minHeight: blockFrame.height,
                  padding: blockFrame.padding,
                  top: blockFrame.top,
                  width: blockFrame.width,
                  outline: "2px solid #111100",
                  outlineOffset: -2,
                }}
              >
                {onBlock(blockFrame)}
              </div>
            )}
          </div>
        )}
        {blockFrame && toolbar && (
          <div
            className="absolute z-20 flex justify-center"
            style={{
              left: 0,
              right: 0,
              top: toolbarTop,
              transform: toolbarAbove ? "translateY(-100%)" : undefined,
            }}
          >
            {toolbar}
          </div>
        )}
      </div>
    </div>
  )
}
