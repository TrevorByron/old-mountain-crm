"use client"

import { useEffect, useRef, useState } from "react"

const EMAIL_WIDTH = 600
const HEIGHT = 352

// The email at its real width, shrunk to fit the card. It can't be clicked or scrolled.
export function EmailThumbnail({ html, title }: { html: string; title: string }) {
  const area = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const element = area.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / EMAIL_WIDTH))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={area} className="pointer-events-none relative overflow-hidden bg-muted" style={{ height: HEIGHT }} aria-hidden>
      {scale > 0 && (
        <iframe
          title={title}
          srcDoc={html}
          sandbox="allow-same-origin"
          tabIndex={-1}
          loading="lazy"
          className="absolute top-0 left-0 origin-top-left border-0"
          style={{ width: EMAIL_WIDTH, height: HEIGHT / scale, transform: `scale(${scale})` }}
        />
      )}
    </div>
  )
}
