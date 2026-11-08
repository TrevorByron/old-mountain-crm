# Subscriber CRM

A self-hosted replacement for Flodesk, for Old Mountain Tours & Explorations: subscribers, branded broadcasts, status-based journeys and engagement tracking. Built with Next.js, shadcn/ui, Supabase, Resend and Inngest.

UI is shadcn/ui components only. Add them with the CLI rather than building your own.

Phase 1 is in place: login, Airtable sync, the subscriber table, unsubscribe and signup. Sending starts in Phase 2.

## Local setup

Requires Node 22 (see `.nvmrc`).

```bash
npm install
cp .env.example .env.local
npm run dev
```

```bash
npm test
```

## How contact data flows

| Data | Lives in | Direction |
|---|---|---|
| Name, email, status, source, segments | Airtable, copied to Supabase | Airtable to app. App edits to name, email and status are written back. |
| Sends, events, journeys, broadcasts | Supabase only | None |
| Unsubscribed and suppressed | Supabase decides | App to Airtable, if `AIRTABLE_OPT_OUT_FIELD_ID` is set |

Rules worth knowing:

- **A sync can't re-subscribe anyone.** The sync never writes the opt-out columns, and a database trigger rejects clearing them. Signing up again doesn't undo an opt-out either.
- **Reversing an opt-out is deliberate.** Someone who asks to come back needs a direct database change inside a transaction that runs `set local app.allow_resubscribe = 'on'`.
- **Subscribers are never deleted by a sync.** Removing an Airtable row leaves the subscriber and their opt-out in place, and re-adding the row reconnects by email.
- **Airtable outages don't block app edits.** Changes are saved here, flagged `airtable_push_pending`, and retried at the start of the next sync. Until then the sync won't overwrite that contact.
- **Only mapped fields are copied.** Phone, objections and trip notes stay in Airtable. The mapping is in `src/lib/airtable/client.ts`, by field id, so renaming a column doesn't break it.
- **Scheduled syncs wait for the first import.** They do nothing until someone has previewed and committed it on the Airtable sync page.

## Supabase setup

1. Create a project and copy the URL, anon key and service role key into `.env.local`.
2. Run each file in `supabase/migrations`, in order, in the SQL editor.
3. Add the first team member, using the SQL editor:

   ```sql
   insert into team_members (email, name) values ('you@example.com', 'Your Name');
   ```

4. Under Authentication > URL Configuration, set the Site URL to `APP_URL` and add `APP_URL/**` to Redirect URLs, such as `http://localhost:3100/**`.

This is enough for existing team members to sign in, but Supabase's built-in email has limits:

- It's rate limited to a few emails per hour.
- It only delivers to members of the Supabase organization, so teammates won't receive invites or sign-in links.
- Its links only work in the browser that requested them.

### Before inviting teammates

1. Under Authentication > SMTP Settings, set Resend as the custom SMTP provider. This needs the DNS records below.
2. Under Authentication > Email Templates, which unlock once SMTP is set, point the links at the app so they work on any device:

   - **Magic Link:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
   - **Invite user:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`

## Airtable setup

1. Create a personal access token with `data.records:read` and `data.records:write`, limited to the contact base.
2. Set `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` and `AIRTABLE_TABLE_ID`.
3. Optional: add a checkbox field such as "Email opt-out" and put its field id in `AIRTABLE_OPT_OUT_FIELD_ID`, so opt-outs are visible in Airtable.

## Signup endpoint

`POST /api/subscribe` takes JSON or form data with `email`, optional `name` and `source`, and a hidden `website` honeypot field that must stay empty. It's limited to 10 requests per hour per IP. Set `SIGNUP_ALLOWED_ORIGINS` to the sites allowed to post; with none set, every request is refused.

## DNS (done manually)

- **Sending subdomain** `mail.old-mountain.com`: add the SPF and DKIM records from Resend.
- **DMARC** on the root domain: the record is already at `p=none` but has no reporting. Add a `rua=mailto:` address so reports arrive, and tighten later.
- **Click tracking:** add a CNAME such as `links.old-mountain.com`, pointed at Resend.
- Never send marketing mail from the root domain or Google Workspace.

## Scheduled sync

Inngest runs the Airtable sync every 15 minutes through `/api/inngest`. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in production. Locally, run `npx inngest-cli@latest dev` to trigger it.
