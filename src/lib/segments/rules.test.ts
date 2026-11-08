import { describe, expect, it } from "vitest"

import { describeRules, parseKeywords, ruleOptions, segmentRulesSchema } from "./rules"

describe("ruleOptions", () => {
  it("collects each field's distinct choices from text and list columns", () => {
    const options = ruleOptions(
      [
        { departure_window: "July 2027", interests: ["Tented Camps", "New foods"], segments: [] },
        { departure_window: "February 2027", interests: ["Tented Camps"], segments: ["Past Clients"] },
        { departure_window: null, interests: [], segments: [] },
      ],
      ["New", "Paid"]
    )
    expect(options.departure_windows).toEqual(["February 2027", "July 2027"])
    expect(options.interests).toEqual(["New foods", "Tented Camps"])
    expect(options.airtable_segments).toEqual(["Past Clients"])
    expect(options.trip_types).toEqual([])
  })

  it("keeps statuses in the team's own order", () => {
    expect(ruleOptions([{ status: "Paid" }], ["New", "Paid"]).statuses).toEqual(["New", "Paid"])
  })
})

describe("parseKeywords", () => {
  it("splits on commas, tidies up and drops repeats", () => {
    expect(parseKeywords(" family, kids ,, family")).toEqual(["family", "kids"])
    expect(parseKeywords("   ")).toEqual([])
  })
})

describe("segmentRulesSchema", () => {
  it("fills in empty fields", () => {
    expect(segmentRulesSchema.parse({ interests: ["New foods"] })).toMatchObject({
      interests: ["New foods"],
      keywords: [],
      statuses: [],
    })
  })

  it("rejects fields it doesn't know by dropping them", () => {
    expect(segmentRulesSchema.parse({ unsubscribed_at: ["x"] })).not.toHaveProperty("unsubscribed_at")
  })
})

describe("describeRules", () => {
  it("reads like a sentence for the list page", () => {
    const rules = segmentRulesSchema.parse({ departure_windows: ["February 2027", "July 2027"], keywords: ["family"] })
    expect(describeRules(rules)).toBe("Departure window: February 2027 or July 2027 · Wrote about: family")
  })

  it("is empty when there are no rules", () => {
    expect(describeRules(segmentRulesSchema.parse({}))).toBe("")
  })
})
