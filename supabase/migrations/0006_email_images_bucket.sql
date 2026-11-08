-- Photos uploaded in the broadcast editor. Public because inboxes load them without
-- signing in. There are no write policies, so only the server's service role can upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-images', 'email-images', true, 5242880, array['image/jpeg']);
