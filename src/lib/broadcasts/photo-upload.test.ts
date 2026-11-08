import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { cropForEmail, prepareOriginal } from "./photo-upload"

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#c4a96b" } })

// Left half gold, right half olive, so a crop can prove which side it kept.
async function twoTone() {
  const half = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: "#2c3a22" } }).png().toBuffer()
  return sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#c4a96b" } })
    .composite([{ input: half, left: 1000, top: 0 }])
    .jpeg()
    .toBuffer()
}

describe("prepareOriginal", () => {
  it("keeps a large working copy and the photo's shape", async () => {
    const output = await prepareOriginal(await photo(6000, 4000).jpeg().toBuffer())
    expect(await sharp(output).metadata()).toMatchObject({ format: "jpeg", width: 2400, height: 1600 })
  })

  it("doesn't enlarge a small photo", async () => {
    const output = await prepareOriginal(await photo(600, 300).jpeg().toBuffer())
    expect(await sharp(output).metadata()).toMatchObject({ width: 600, height: 300 })
  })

  it("turns a sideways phone photo upright", async () => {
    const input = await photo(4000, 3000).withMetadata({ orientation: 6 }).jpeg().toBuffer()
    expect(await sharp(await prepareOriginal(input)).metadata()).toMatchObject({ width: 1800, height: 2400 })
  })

  it("strips location and other metadata", async () => {
    const input = await photo(1000, 500)
      .withExif({ IFD3: { GPSLatitude: "3/1 22/1 0/1", GPSLongitude: "36/1 41/1 0/1" } })
      .jpeg()
      .toBuffer()
    expect((await sharp(input).metadata()).exif).toBeDefined()
    expect((await sharp(await prepareOriginal(input)).metadata()).exif).toBeUndefined()
  })

  it("converts a PNG, flattening transparency onto white", async () => {
    const input = await sharp({ create: { width: 800, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer()
    const output = await prepareOriginal(input)
    expect((await sharp(output).metadata()).format).toBe("jpeg")
    expect((await sharp(output).stats()).channels[0].mean).toBeGreaterThan(250)
  })

  it("rejects something that isn't an image", async () => {
    await expect(prepareOriginal(Buffer.from("<script>alert(1)</script>"))).rejects.toThrow()
  })
})

describe("cropForEmail", () => {
  it("keeps the part of the photo that was recentered into the frame", async () => {
    const original = await twoTone()
    const left = await cropForEmail(original, { x: 0, y: 0, width: 40, height: 100 })
    const right = await cropForEmail(original, { x: 60, y: 0, width: 40, height: 100 })

    expect((await sharp(left).stats()).channels[0].mean).toBeGreaterThan(150)
    expect((await sharp(right).stats()).channels[0].mean).toBeLessThan(90)
  })

  it("makes the shape the crop asks for, at email width", async () => {
    const output = await cropForEmail(await photo(4000, 3000).jpeg().toBuffer(), { x: 10, y: 10, width: 60, height: 40 })
    expect(await sharp(output).metadata()).toMatchObject({ width: 1200, height: 600 })
  })

  it("uses the whole photo with no crop, shrunk for email", async () => {
    const output = await cropForEmail(await photo(2400, 1200).jpeg().toBuffer(), null)
    expect(await sharp(output).metadata()).toMatchObject({ width: 1200, height: 600 })
  })

  it("stays inside the photo when a crop runs past the edge", async () => {
    const output = await cropForEmail(await photo(1000, 1000).jpeg().toBuffer(), { x: 90, y: 90, width: 50, height: 50 })
    expect(await sharp(output).metadata()).toMatchObject({ width: 100, height: 100 })
  })
})
