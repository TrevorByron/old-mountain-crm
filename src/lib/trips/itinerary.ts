export type ItineraryDay = { label: string; title: string; description: string; stay: string }

// The only page itineraries are pulled from. It's fixed here so nobody can point the server at another address.
export const ITINERARY_SOURCE_URL = "https://www.old-mountain.com/"

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", middot: "·", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" }

function toText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      if (!code.startsWith("#")) return ENTITIES[code.toLowerCase()] ?? whole
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isNaN(point) ? whole : String.fromCodePoint(point)
    })
    .replace(/\s+/g, " ")
    .trim()
}

function textsOf(html: string, className: string) {
  const pattern = new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`, "g")
  return [...html.matchAll(pattern)].map((match) => toText(match[2])).filter(Boolean)
}

// Reads "The Journey" section of the website, one entry per day row.
export function parseItinerary(html: string): ItineraryDay[] {
  const start = html.indexOf('id="itinerary"')
  if (start === -1) return []
  const end = html.indexOf("</section>", start)
  const section = html.slice(start, end === -1 ? undefined : end)

  return section
    .split(/(?=<div[^>]*class="[^"]*\bday-row\b)/)
    .slice(1)
    .map((row) => ({
      label: textsOf(row, "day-num")[0] ?? "",
      title: textsOf(row, "day-title")[0] ?? "",
      description: textsOf(row, "day-desc").join("\n\n"),
      stay: textsOf(row, "day-overnight")[0] ?? "",
    }))
    .filter((day) => day.label || day.title)
}

// Follows on from the last day number anywhere in the labels, so "Days 09-10" leads to "Day 11".
export function nextDayLabel(labels: string[]) {
  const numbers = labels.flatMap((label) => [...label.matchAll(/\d+/g)].map((match) => Number(match[0])))
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
  return `Day ${String(next).padStart(2, "0")}`
}
