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
    })
  })

  it("treats missing and blank cells as empty, since Airtable omits empty fields", () => {
    expect(
      parseContact({
        id: "recEmpty",
        createdTime: "2026-08-15T16:30:27.000Z",
        fields: { [AIRTABLE_FIELDS.name]: "   " },
      })
    ).toMatchObject({ name: null, email: null, status: null, segments: [], source: null })
  })
})
