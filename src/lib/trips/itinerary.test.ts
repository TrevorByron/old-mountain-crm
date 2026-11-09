import { describe, expect, it } from "vitest"

import { nextDayLabel, parseItinerary } from "./itinerary"

const PAGE = `
<section id="pricing"><p class="day-title">Not part of the journey</p></section>
<section id="itinerary">
  <div class="itinerary-header"><p class="itinerary-subnote">Subject to change</p></div>
  <div class="itinerary-days">
    <div class="day-row reveal">
      <span class="day-num">Day 01</span>
      <div class="day-content">
        <p class="day-title">Arrive &amp; settle</p>
        <p class="day-desc">Meet at the
          airport.</p>
        <p class="day-overnight">Overnight: First Lodge &middot; 1 Night</p>
      </div>
    </div>
    <div class="day-row reveal reveal-delay-1">
      <span class="day-num">Days 02&#8211;03</span>
      <div class="day-content">
        <p class="day-title">The <em>ranch</em></p>
        <p class="day-desc">First paragraph.</p>
        <p class="day-desc">Second paragraph.</p>
      </div>
    </div>
  </div>
</section>
<section id="after"><p class="day-desc">Also not the journey</p></section>`

describe("parseItinerary", () => {
  it("reads each day from the journey section only", () => {
    expect(parseItinerary(PAGE)).toEqual([
      { label: "Day 01", title: "Arrive & settle", description: "Meet at the airport.", stay: "Overnight: First Lodge · 1 Night" },
      { label: "Days 02–03", title: "The ranch", description: "First paragraph.\n\nSecond paragraph.", stay: "" },
    ])
  })

  it("finds nothing when the section isn't there", () => {
    expect(parseItinerary("<section id='other'></section>")).toEqual([])
    expect(parseItinerary('<section id="itinerary"><p>Coming soon</p></section>')).toEqual([])
  })
})

describe("nextDayLabel", () => {
  it("starts at day one", () => {
    expect(nextDayLabel([])).toBe("Day 01")
  })

  it("follows the highest day in the labels", () => {
    expect(nextDayLabel(["Day 01", "Days 09–10"])).toBe("Day 11")
  })

  it("copes with labels that have no number", () => {
    expect(nextDayLabel(["Arrival"])).toBe("Day 01")
  })
})
