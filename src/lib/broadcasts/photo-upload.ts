import sharp from "sharp"

export const EMAIL_IMAGES_BUCKET = "email-images"
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

const ORIGINAL_EDGE = 2400
const EMAIL_WIDTH = 1200

export type CropArea = { x: number; y: number; width: number; height: number }

// Kept so a photo can be recentered later. Re-encoding upright also strips location data.
export async function prepareOriginal(input: Buffer) {
  return sharp(input)
    .rotate()
    .resize(ORIGINAL_EDGE, ORIGINAL_EDGE, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()
}

// What goes in the email. `area` is in percent of the photo, as the cropper reports it, and
// an actual crop is cut because most inboxes ignore CSS for positioning images.
export async function cropForEmail(original: Buffer, area: CropArea | null) {
  const image = sharp(original).rotate()
  const metadata = await image.metadata()
  const width = metadata.autoOrient?.width ?? metadata.width
  const height = metadata.autoOrient?.height ?? metadata.height

  const flat = await image.flatten({ background: "#ffffff" }).toBuffer()
  const cropped = sharp(flat)
  if (area) {
    const left = Math.max(0, Math.min(width - 1, Math.round((area.x / 100) * width)))
    const top = Math.max(0, Math.min(height - 1, Math.round((area.y / 100) * height)))
    cropped.extract({
      left,
      top,
      width: Math.max(1, Math.min(width - left, Math.round((area.width / 100) * width))),
      height: Math.max(1, Math.min(height - top, Math.round((area.height / 100) * height))),
    })
  }
  return cropped.resize({ width: EMAIL_WIDTH, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer()
}
