// Picked from the brand library for email, resized with location data stripped. No recognizable
// people, because most of the library is family photos that shouldn't go out without a decision.
export const EMAIL_PHOTOS = [
  { path: "/email/photos/lion-cubs.jpg", label: "Lion cubs on a rock", alt: "Three lion cubs resting on a boulder" },
  { path: "/email/photos/lion-grass.jpg", label: "Lion in golden grass", alt: "A lion stretched out in tall golden grass" },
  { path: "/email/photos/waterfall.jpg", label: "Waterfall", alt: "A waterfall running through green forest into a dark pool" },
  { path: "/email/photos/gorge.jpg", label: "Green gorge", alt: "A river running over rocks below small waterfalls in a green gorge" },
  { path: "/email/photos/volcano-road.jpg", label: "Road to the volcano", alt: "A motorcycle on a dirt road leading toward a volcano" },
  { path: "/email/photos/savanna-mountain.jpg", label: "Mountain over savanna", alt: "A mountain above the clouds, with zebras on the plain below" },
  { path: "/email/photos/green-hills.jpg", label: "Forested hills", alt: "A mountain beyond forested hills" },
  { path: "/email/photos/valley-view.jpg", label: "View through the trees", alt: "A wide valley seen through acacia trees" },
  { path: "/email/photos/sunset.jpg", label: "Sunset over water", alt: "The sun setting over calm water" },
  { path: "/email/photos/defender.jpg", label: "Land Rover Defender", alt: "A Land Rover Defender parked in green grass under a big sky" },
  { path: "/email/photos/camp.jpg", label: "Camp under the trees", alt: "Tents and a vehicle in a clearing under large trees" },
] as const

export function photoAlt(path: string | null) {
  return EMAIL_PHOTOS.find((photo) => photo.path === path)?.alt ?? null
}
