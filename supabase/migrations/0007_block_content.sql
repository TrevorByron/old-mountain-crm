-- Broadcasts become a list of blocks instead of fixed slots. Nothing had been written
-- in the old columns when this ran, so nothing needs converting.
alter table broadcasts
  add column content jsonb,
  drop column kicker,
  drop column heading,
  drop column body_markdown,
  drop column cta_label,
  drop column cta_url,
  drop column image_url,
  drop column image_alt;

-- Saved templates hold their blocks here. The built-in ones (layout_key other than
-- 'custom') keep theirs in code, so they can improve without a migration.
alter table templates add column content jsonb;
