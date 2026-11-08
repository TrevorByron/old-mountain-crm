# Subscriber CRM

A self-hosted replacement for Flodesk, for Old Mountain Tours & Explorations: subscribers, branded broadcasts, status-based journeys and engagement tracking. Built with Next.js, shadcn/ui, Supabase, Resend and Inngest.

UI is shadcn/ui components only. Add them with the CLI rather than building your own.

In place: login, Airtable sync, the subscriber table, saved segments, unsubscribe, signup, and broadcasts. Tracking and journeys come next.

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

To skip sign-in while building, set `DEV_AUTH_EMAIL` in `.env.local` to a team member's email. It only works under `npm run dev`, which listens on this machine only, and it's ignored by production builds and on Vercel. Row-level security doesn't apply in this mode, so test those rules with it unset.

## How contact data flows

| Data | Lives in | Direction |
|---|---|---|
| Name, email, status, source, segments, phone, account owner and form answers | Airtable, copied to Supabase | Airtable to app. App edits to name, email and status are written back. |
| Sends, events, journeys, broadcasts | Supabase only | None |
| Unsubscribed and suppressed | Supabase decides | App to Airtable, if `AIRTABLE_OPT_OUT_FIELD_ID` is set |

Rules worth knowing:

- **A sync can't re-subscribe anyone.** The sync never writes the opt-out columns, and a database trigger rejects clearing them. Signing up again doesn't undo an opt-out either.
- **Reversing an opt-out is deliberate.** Someone who asks to come back needs a direct database change inside a transaction that runs `set local app.allow_resubscribe = 'on'`.
- **Subscribers are never deleted by a sync.** Removing an Airtable row leaves the subscriber and their opt-out in place, and re-adding the row reconnects by email.
- **Airtable outages don't block app edits.** Changes are saved here, flagged `airtable_push_pending`, and retried at the start of the next sync. Until then the sync won't overwrite that contact.
- **Every column is copied except the opt-out checkbox.** A new Airtable column needs adding to the mapping in `src/lib/airtable/client.ts` and a migration. The mapping is by field id, so renaming a column doesn't break it.
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

## Segments

A saved segment is a named group that stays current as Airtable changes. Someone is in it if they match its rules or were added by hand (on the segment page, or by selecting people on Subscribers).

- Within a rule field, any choice counts. Across fields, all must match. A segment with no rules holds only the people added by hand.
- "Words they wrote" searches written-in interests, written-in objections and how they heard about you.
- These are separate from Airtable's Segment column, which comes across read-only.

## Broadcasts

A broadcast reaches anyone in at least one chosen saved segment, status or Airtable segment. To combine conditions, such as new leads who want July, save a segment.

Who can receive email is decided in one place, the `broadcast_audience` database function, which removes unsubscribed and suppressed people. The live count and the real send both use it. A send also rechecks each batch just before it goes.

Sending needs `RESEND_API_KEY`, `SENDER_FROM`, `SENDER_POSTAL_ADDRESS`, `UNSUBSCRIBE_TOKEN_SECRET` and `APP_URL`. Real recipients also need `APP_URL` to be a deployed address, because their unsubscribe links have to work. "Send test to me" works on localhost, and its unsubscribe link can't opt anyone out.

Each recipient gets a `sends` row keyed `broadcast:{id}:{subscriber_id}`, and each batch uses a Resend idempotency key, so retries don't send twice. If a send runs out of retries it shows as Stopped, and resuming only reaches people who haven't been sent to. A single send is limited to about 33,000 recipients by Inngest's step limit.

To run sends locally, set `INNGEST_DEV=1` and run:

```bash
npx inngest-cli@latest dev
```

## Signup endpoint

`POST /api/subscribe` takes JSON or form data with `email`, optional `name` and `source`, and a hidden `website` honeypot field that must stay empty. It's limited to 10 requests per hour per IP. Set `SIGNUP_ALLOWED_ORIGINS` to the sites allowed to post; with none set, every request is refused.

## DNS (done manually)

- **Sending subdomain** `mail.old-mountain.com`: add the SPF and DKIM records from Resend.
- **DMARC** on the root domain: the record is already at `p=none` but has no reporting. Add a `rua=mailto:` address so reports arrive, and tighten later.
- **Click tracking:** add a CNAME such as `links.old-mountain.com`, pointed at Resend.
- Never send marketing mail from the root domain or Google Workspace.

## Scheduled sync

Inngest runs the Airtable sync every 15 minutes through `/api/inngest`. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in production. Locally, run `npx inngest-cli@latest dev` to trigger it.
