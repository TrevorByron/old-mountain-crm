// Picked from the brand library for email, with location data stripped. `path` is an email-sized
// default crop and `original` is the full photo that recentering works from. No recognizable
// people, because most of the library is family photos that shouldn't go out without a decision.
const photo = (name: string, label: string, alt: string) => ({
  path: `/email/photos/${name}.jpg`,
  original: `/email/originals/${name}.jpg`,
  label,
  alt,
})

export const EMAIL_PHOTOS = [
  photo("lion-cubs", "Lion cubs on a rock", "Three lion cubs resting on a boulder"),
  photo("lion-grass", "Lion in golden grass", "A lion stretched out in tall golden grass"),
  photo("waterfall", "Waterfall", "A waterfall running through green forest into a dark pool"),
  photo("gorge", "Green gorge", "A river running over rocks below small waterfalls in a green gorge"),
  photo("volcano-road", "Road to the volcano", "A motorcycle on a dirt road leading toward a volcano"),
  photo("savanna-mountain", "Mountain over savanna", "A mountain above the clouds, with zebras on the plain below"),
  photo("green-hills", "Forested hills", "A mountain beyond forested hills"),
  photo("valley-view", "View through the trees", "A wide valley seen through acacia trees"),
  photo("sunset", "Sunset over water", "The sun setting over calm water"),
  photo("defender", "Land Rover Defender", "A Land Rover Defender parked in green grass under a big sky"),
  photo("camp", "Camp under the trees", "Tents and a vehicle in a clearing under large trees"),
]
