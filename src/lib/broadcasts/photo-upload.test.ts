import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { prepareEmailPhoto } from "./photo-upload"

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#c4a96b" } })

describe("prepareEmailPhoto", () => {
  it("shrinks a wide photo to email width and keeps its shape", async () => {
    const output = await prepareEmailPhoto(await photo(4000, 2000).jpeg().toBuffer())
    expect(await sharp(output).metadata()).toMatchObject({ format: "jpeg", width: 1200, height: 600 })
  })

  it("crops a tall phone photo so it can't fill the inbox", async () => {
    const output = await prepareEmailPhoto(await photo(3024, 4032).jpeg().toBuffer())
    expect(await sharp(output).metadata()).toMatchObject({ width: 1200, height: 800 })
  })

  it("doesn't enlarge a small photo", async () => {
    const output = await prepareEmailPhoto(await photo(600, 300).jpeg().toBuffer())
    expect(await sharp(output).metadata()).toMatchObject({ width: 600, height: 300 })
  })

  it("turns a sideways phone photo upright before measuring it", async () => {
    const input = await photo(4000, 3000).withMetadata({ orientation: 6 }).jpeg().toBuffer()
    const output = await prepareEmailPhoto(input)
    expect(await sharp(output).metadata()).toMatchObject({ width: 1200, height: 800 })
  })

  it("strips location and other metadata", async () => {
    const input = await photo(1000, 500)
      .withExif({ IFD3: { GPSLatitude: "3/1 22/1 0/1", GPSLongitude: "36/1 41/1 0/1" } })
      .jpeg()
      .toBuffer()
    expect((await sharp(input).metadata()).exif).toBeDefined()
    expect((await sharp(await prepareEmailPhoto(input)).metadata()).exif).toBeUndefined()
  })

  it("converts a PNG, flattening transparency onto white", async () => {
    const input = await sharp({ create: { width: 800, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer()
    const output = await prepareEmailPhoto(input)
    const { channels } = await sharp(output).stats()
    expect((await sharp(output).metadata()).format).toBe("jpeg")
    expect(channels[0].mean).toBeGreaterThan(250)
  })

  it("rejects something that isn't an image", async () => {
    await expect(prepareEmailPhoto(Buffer.from("<script>alert(1)</script>"))).rejects.toThrow()
  })
})
