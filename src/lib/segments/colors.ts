// The colors a segment can be. Each is light enough for dark text on top, in either theme.
export const SEGMENT_COLORS = [
  { key: "coral", label: "Coral", hex: "#E2786B" },
  { key: "blush", label: "Blush", hex: "#E8C7C8" },
  { key: "rose", label: "Rose", hex: "#F8DCDA" },
  { key: "linen", label: "Linen", hex: "#F3EBE2" },
  { key: "sand", label: "Sand", hex: "#E3D6C1" },
  { key: "ochre", label: "Ochre", hex: "#D3A756" },
  { key: "sun", label: "Sun", hex: "#F6DA5C" },
  { key: "butter", label: "Butter", hex: "#FCF59A" },
  { key: "lilac", label: "Lilac", hex: "#E2C4F6" },
  { key: "lavender", label: "Lavender", hex: "#D2D0F2" },
  { key: "periwinkle", label: "Periwinkle", hex: "#A6B9E7" },
  { key: "sky", label: "Sky", hex: "#C5DFF8" },
  { key: "mint", label: "Mint", hex: "#E1F0EA" },
  { key: "sage", label: "Sage", hex: "#D3DDD8" },
  { key: "moss", label: "Moss", hex: "#B8BF82" },
  { key: "pine", label: "Pine", hex: "#88A895" },
  { key: "cream", label: "Cream", hex: "#F3F4E6" },
  { key: "fog", label: "Fog", hex: "#E9E9E8" },
  { key: "slate", label: "Slate", hex: "#8A9AAE" },
  { key: "cobalt", label: "Cobalt", hex: "#7A8DD6" },
] as const

export type SegmentColor = (typeof SEGMENT_COLORS)[number]["key"]
export const SEGMENT_COLOR_KEYS = SEGMENT_COLORS.map((color) => color.key) as [SegmentColor, ...SegmentColor[]]
export const DEFAULT_SEGMENT_COLOR: SegmentColor = "sand"

export const segmentColorHex = (key: string | null | undefined) =>
  SEGMENT_COLORS.find((color) => color.key === key)?.hex ?? SEGMENT_COLORS.find((color) => color.key === DEFAULT_SEGMENT_COLOR)!.hex
