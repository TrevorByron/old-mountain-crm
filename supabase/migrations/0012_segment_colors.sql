-- A color for each segment, so they're easy to tell apart. The list matches src/lib/segments/colors.ts.
alter table segments
  add column color text not null default 'sand'
  check (color in ('coral', 'blush', 'rose', 'linen', 'sand', 'ochre', 'sun', 'butter', 'lilac', 'lavender', 'periwinkle', 'sky', 'mint', 'sage', 'moss', 'pine', 'cream', 'fog', 'slate', 'cobalt'));
