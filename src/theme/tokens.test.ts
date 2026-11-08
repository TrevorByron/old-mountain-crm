import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { dark, light, radius } from "./tokens"

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8")
const block = (selector: string) => css.split(`${selector} {`)[1].split("}")[0]

describe("globals.css matches the shared tokens", () => {
  it.each(Object.entries(light))("light --%s", (name, value) => {
    expect(block(":root")).toContain(`--${name}: ${value};`)
  })

  it.each(Object.entries(dark))("dark --%s", (name, value) => {
    expect(block(".dark")).toContain(`--${name}: ${value};`)
  })

  it("radius", () => {
    expect(block(":root")).toContain(`--radius: ${radius};`)
  })
})
