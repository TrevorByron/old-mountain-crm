import sharp from "sharp"

export const EMAIL_IMAGES_BUCKET = "email-images"
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

const WIDTH = 1200
const MAX_HEIGHT = 800

// Everything uploaded is re-encoded here, which also strips location data. Portrait phone
// photos are cropped around the middle so one photo can't fill a whole inbox screen.
export async function prepareEmailPhoto(input: Buffer) {
  const image = sharp(input).rotate()
  const metadata = await image.metadata()
  const landscape = (metadata.autoOrient?.height ?? 0) / (metadata.autoOrient?.width ?? 1) <= MAX_HEIGHT / WIDTH

  return image
    .resize(landscape ? { width: WIDTH, withoutEnlargement: true } : { width: WIDTH, height: MAX_HEIGHT, fit: "cover" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer()
}
