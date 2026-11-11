"use client"

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useIsMobile } from "@/hooks/use-mobile"

const HIGHLIGHT_STYLE = `
  html, body { overflow: hidden; }
  [data-block-id] { cursor: pointer; }
  [data-block-id]:hover { outline: 2px dashed #c4a96b; outline-offset: -2px; }
  [data-block-id][data-selected] { outline: 2px solid #111100; outline-offset: -2px; }
  [data-block-id][data-dragging] { opacity: 0.35; }
  html[data-dragging], html[data-dragging] * { cursor: grabbing !important; user-select: none; }
  img { -webkit-user-drag: none; }
`

const DEVICE_WIDTHS = { desktop: 720, mobile: 375 }
const TOOLBAR_ROOM = 140
// How close the pointer has to be to the line between two blocks for its + to show.
const GAP_REACH = 14
const DRAG_START = 5

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

export type EmailPreviewHandle = {
  // Starts moving the selected block from the toolbar's drag handle.
  startDrag: (event: ReactPointerEvent) => void
}

// Touch screens have no hover, so their + buttons stay put instead of following the pointer.
function subscribeHover(onChange: () => void) {
  const query = window.matchMedia("(hover: hover)")
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

// Each block's top and bottom edge in the email, in order.
type BlockSpan = { id: string; top: number; bottom: number }

function same<T>(a: T, b: T) {
  return JSON.stringify(a) === JSON.stringify(b)
}

// The line a new or moved block would land on: above block `index`, or under the last one.
function gapY(spans: BlockSpan[], index: number) {
  if (spans.length === 0) return 48
  return index >= spans.length ? spans[spans.length - 1].bottom : spans[index].top
}

function dropIndexAt(spans: BlockSpan[], y: number) {
  const index = spans.findIndex((span) => y < (span.top + span.bottom) / 2)
  return index === -1 ? spans.length : index
}

// Same-origin so the editor can reach in for click-to-select, and so the browser doesn't
// treat the frame as an outside site and block its images. Scripts in the email can't run.
// The frame is as tall as the email, so the page scrolls and tools can sit on top of a block.
export function EmailPreview({
  ref,
  html,
  selectedId,
  onSelect,
  toolbar,
  onBlock,
  onReorder,
  renderAdd,
}: {
  ref?: Ref<EmailPreviewHandle>
  html: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  // Floats over the selected block, at the page's own size.
  toolbar?: ReactNode
  // Laid over the selected block at the email's size, for writing straight onto it.
  onBlock?: (frame: BlockFrame) => ReactNode
  // A block was dragged to sit above block `index`, or last when `index` is the count.
  onReorder?: (id: string, index: number) => void
  // The + that adds a block at `index`, between two blocks or under the last one.
  renderAdd?: (index: number, onOpenChange: (open: boolean) => void) => ReactNode
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
  const [spans, setSpans] = useState<BlockSpan[]>([])
  const [hoverGap, setHoverGap] = useState<number | null>(null)
  const [openGap, setOpenGap] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ id: string; y: number } | null>(null)
  const canHover = useSyncExternalStore(
    subscribeHover,
    () => window.matchMedia("(hover: hover)").matches,
    () => true
  )
  // Lays the email out at its real width, then scales it to fit, so "Desktop" stays true
  // to what a desktop inbox shows even on a narrow screen.
  const width = DEVICE_WIDTHS[device]
  const scale = areaWidth > 0 ? Math.min(1, areaWidth / width) : 1
  const offset = Math.max(0, (areaWidth - width * scale) / 2)
  const pending = useRef<{ id: string; y: number } | null>(null)
  const dragging = useRef<{ id: string; y: number } | null>(null)
  const suppressClick = useRef(false)
  const live = useRef({ spans, scale: 1, onReorder })

  // The frame only loads once. After that its contents are swapped in place, so typing
  // doesn't flash the preview.
  if (!firstHtml && html) setFirstHtml(html)

  function measure() {
    const doc = frame.current?.contentDocument
    if (!doc?.body) return
    setContentHeight(doc.documentElement.scrollHeight)
    const nextSpans = [...doc.querySelectorAll<HTMLElement>("[data-block-id]")].map((element) => {
      const rect = element.getBoundingClientRect()
      return { id: element.dataset.blockId ?? "", top: rect.top, bottom: rect.bottom }
    })
    setSpans((current) => (same(current, nextSpans) ? current : nextSpans))
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
    setBlockFrame((current) => (same(current, next) ? current : next))
  }
  const measureRef = useRef(measure)

  function beginDrag(id: string, y: number) {
    const doc = frame.current?.contentDocument
    doc?.getSelection()?.removeAllRanges()
    doc?.documentElement.setAttribute("data-dragging", "")
    doc?.querySelector(`[data-block-id="${CSS.escape(id)}"]`)?.setAttribute("data-dragging", "")
    dragging.current = { id, y }
    setDrag(dragging.current)
    setHoverGap(null)
  }

  function moveDrag(y: number) {
    if (!dragging.current) return
    dragging.current = { ...dragging.current, y }
    setDrag(dragging.current)
  }

  function endDrag() {
    const current = dragging.current
    pending.current = null
    if (!current) return
    const doc = frame.current?.contentDocument
    doc?.documentElement.removeAttribute("data-dragging")
    doc?.querySelectorAll("[data-dragging]").forEach((element) => element.removeAttribute("data-dragging"))
    dragging.current = null
    setDrag(null)
    suppressClick.current = true
    live.current.onReorder?.(current.id, dropIndexAt(live.current.spans, current.y))
  }

  // Shows the + for the gap the pointer is near, if any.
  function hoverAt(y: number) {
    const { spans: current, scale: currentScale } = live.current
    const reach = GAP_REACH / currentScale
    let near: number | null = null
    for (let index = 1; index <= current.length; index += 1) {
      if (Math.abs(y - gapY(current, index)) < reach) near = index
    }
    setHoverGap(near)
  }

  const actions = useRef({ beginDrag, moveDrag, endDrag, hoverAt })

  // The toolbar's handle, for a block that's covered by its text editor or on a touch screen.
  // Capturing the pointer keeps the drag going while it passes over the email's frame.
  function startDrag(event: ReactPointerEvent) {
    const id = selected.current
    const iframe = frame.current
    if (!id || !iframe) return
    event.preventDefault()
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture(event.pointerId)
    const toEmail = (clientY: number) => (clientY - iframe.getBoundingClientRect().top) / live.current.scale
    const startY = event.clientY
    const onMove = (move: PointerEvent) => {
      if (!dragging.current && Math.abs(move.clientY - startY) > DRAG_START) beginDrag(id, toEmail(move.clientY))
      moveDrag(toEmail(move.clientY))
    }
    const onUp = () => {
      endDrag()
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onUp)
      handle.removeEventListener("pointercancel", onUp)
    }
    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onUp)
    handle.addEventListener("pointercancel", onUp)
  }

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
    actions.current = { beginDrag, moveDrag, endDrag, hoverAt }
    live.current = { spans, scale, onReorder }
  })

  useImperativeHandle(ref, () => ({ startDrag }))

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
      // The click that ends a drag isn't a click on the block.
      if (suppressClick.current) {
        suppressClick.current = false
        return
      }
      const block = (event.target as Element).closest?.("[data-block-id]")
      select.current(block?.getAttribute("data-block-id") ?? null)
    })
    // Grab any block with the mouse and drag it to a new place. Touch keeps scrolling the page,
    // and moves blocks with the toolbar's handle instead.
    doc.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return
      const id = (event.target as Element).closest?.("[data-block-id]")?.getAttribute("data-block-id")
      if (!id) return
      pending.current = { id, y: event.clientY }
      // Keeps the drag going if the pointer slips past the email's edge.
      try {
        ;(event.target as Element).setPointerCapture(event.pointerId)
      } catch {
        // Not every pointer can be captured. The drag still works inside the email.
      }
    })
    doc.addEventListener("pointermove", (event) => {
      const start = pending.current
      if (start && !dragging.current && Math.abs(event.clientY - start.y) > DRAG_START) {
        actions.current.beginDrag(start.id, event.clientY)
      }
      if (dragging.current) actions.current.moveDrag(event.clientY)
      else if (!start) actions.current.hoverAt(event.clientY)
    })
    doc.addEventListener("pointerup", () => {
      if (dragging.current) actions.current.endDrag()
      pending.current = null
    })
    doc.addEventListener("dragstart", (event) => event.preventDefault())
    // Photos finishing loading change the email's height, and the selected block's place.
    new view.ResizeObserver(() => measureRef.current()).observe(doc.body)
    if (latestHtml.current) swapBody(doc, latestHtml.current)
    highlight()
  }

  const height = Math.max(contentHeight, 320)

  // Above the block when there's room, otherwise just under its top edge.
  const toolbarAbove = blockFrame ? blockFrame.top * scale > TOOLBAR_ROOM : true
  const toolbarTop = blockFrame ? (toolbarAbove ? blockFrame.top * scale - 8 : (blockFrame.top + blockFrame.height) * scale + 8) : 0

  // An empty email always offers its first block. Otherwise the + follows the pointer, or on
  // touch screens sits under the selected block and the last one.
  const selectedPosition = spans.findIndex((span) => span.id === selectedId)
  const gaps =
    spans.length === 0
      ? [0]
      : canHover
        ? [hoverGap, openGap]
        : [openGap, spans.length, selectedPosition >= 0 ? selectedPosition + 1 : null]
  const shownGaps = drag ? [] : [...new Set(gaps.filter((gap): gap is number => gap !== null))]

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
      <div
        ref={area}
        className="relative"
        style={{ height: height * scale }}
        onPointerLeave={() => setHoverGap(null)}
      >
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
        {renderAdd &&
          shownGaps.map((index) => (
            <div
              key={index}
              className="pointer-events-none absolute z-10 flex items-center justify-center"
              style={{ left: offset, top: gapY(spans, index) * scale, transform: "translateY(-50%)", width: width * scale }}
            >
              <span className="absolute inset-x-6 h-px bg-foreground/30" aria-hidden="true" />
              <span className="pointer-events-auto relative">
                {renderAdd(index, (open) => setOpenGap(open ? index : null))}
              </span>
            </div>
          ))}
        {drag && (
          <div
            className="pointer-events-none absolute z-30 h-0.5 rounded-full bg-foreground"
            style={{ left: offset + 16, top: gapY(spans, dropIndexAt(spans, drag.y)) * scale - 1, width: width * scale - 32 }}
            aria-hidden="true"
          />
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
