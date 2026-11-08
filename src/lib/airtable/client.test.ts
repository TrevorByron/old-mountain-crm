import { describe, expect, it } from "vitest"

import { AIRTABLE_FIELDS, parseContact } from "./client"

describe("parseContact", () => {
  it("reads a full record by field id", () => {
    expect(
      parseContact({
        id: "recMaraOkafor0001",
        createdTime: "2026-08-15T16:30:27.000Z",
        fields: {
          [AIRTABLE_FIELDS.name]: "Mara Okafor",
          [AIRTABLE_FIELDS.email]: "mara.okafor@example.com",
          [AIRTABLE_FIELDS.status]: "Connected With",
          [AIRTABLE_FIELDS.segments]: ["Leads - 2027", "Past Clients "],
          [AIRTABLE_FIELDS.source]: "Instagram",
          [AIRTABLE_FIELDS.phone]: "(828) 555-0142",
          [AIRTABLE_FIELDS.accountOwner]: "Jesse",
          [AIRTABLE_FIELDS.tripType]: "Group",
          [AIRTABLE_FIELDS.departureWindow]: "July 2027",
          [AIRTABLE_FIELDS.groupSize]: "2 people",
          [AIRTABLE_FIELDS.interests]: ["Wildlife photography", "Tented Camps"],
          [AIRTABLE_FIELDS.interestsOther]: "Birding near Lake Manyara",
          [AIRTABLE_FIELDS.objections]: ["Cost"],
          [AIRTABLE_FIELDS.objectionsOther]: "Need to line up time off work",
        },
      })
    ).toEqual({
      recordId: "recMaraOkafor0001",
      createdTime: "2026-08-15T16:30:27.000Z",
      name: "Mara Okafor",
      email: "mara.okafor@example.com",
      status: "Connected With",
      segments: ["Leads - 2027", "Past Clients "],
      source: "Instagram",
      phone: "(828) 555-0142",
      accountOwner: "Jesse",
      tripType: "Group",
      departureWindow: "July 2027",
      groupSize: "2 people",
      interests: ["Wildlife photography", "Tented Camps"],
      interestsOther: "Birding near Lake Manyara",
      objections: ["Cost"],
      objectionsOther: "Need to line up time off work",
    })
  })

  it("treats missing and blank cells as empty, since Airtable omits empty fields", () => {
    expect(
      parseContact({
        id: "recEmpty",
        createdTime: "2026-08-15T16:30:27.000Z",
        fields: { [AIRTABLE_FIELDS.name]: "   " },
      })
    ).toMatchObject({ name: null, email: null, status: null, segments: [], source: null, phone: null, interests: [] })
  })
})
