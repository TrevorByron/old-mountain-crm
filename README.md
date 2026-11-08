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
| Name, email, source, segments, phone, account owner and form answers | Airtable, copied to Supabase | Airtable to app. App edits to name and email are written back. |
| Status | The app | Airtable's value only sets a new contact's starting status |
| Trips, trip plans, stages, payments, activity | Supabase only | None |
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

## CRM

Follows someone from first interest to repeat trip. Stages are set by hand for now.

- **Person:** a row in `subscribers`. Email is optional, because a traveling spouse may not have one; they just can't receive email.
- **Trip:** a departure or custom safari, with dates, seats, price and terms.
- **Trip plan:** one person or group pursuing one trip. Someone who books twice has two plans and one history.
- **Payment:** entered by hand. Paid, balance and overdue are worked out from these in `src/lib/pipeline/stages.ts`.
- **Activity:** the log. Stage, itinerary and payment changes record themselves through database triggers, so they can't be skipped.

**Overall stage** (Subscriber, Prospect, Customer, Past guest) isn't stored. The `contact_lifecycle` view takes the furthest stage any of their plans has reached, so a past guest with a new inquiry stays a past guest and correcting a mistaken stage corrects it too.

**Today** (`/today`) is the home page: everything waiting on the team, from `loadAttention` in `src/lib/pipeline/attention.ts`, which also drives the nav badge.

**The profile** at `/subscribers/[id]` is the place to look someone up: last contact, what's next, trips and money, your own notes and tags, form answers, and a full timeline. Press Cmd+K anywhere to find a person. Tags work as a segment rule, and notes are searched by the "Words they wrote" rule.

**Marketing permission:** people added by hand, or as a traveler, stay off marketing sends (`marketing_ok`) until someone ticks the box or they sign up themselves.

Keep passport, medical and card details out of this app: everyone on the team is a full admin. The prep checklist only records that something was handled. There are no automatic backups on Supabase's free plan, which matters more now that payments are recorded here.

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

### Email builder

An email is a list of blocks: text, photo, photo beside text, button, logo, divider, space and links. They're edited in the panel on the left, or by clicking them in the preview, and drafts save automatically. The sidebar collapses while you're in the builder to give it room, and the preview lays out at true width and scales to fit. The renderer is in `src/emails/`, the block definitions and brand limits are in `src/lib/broadcasts/blocks.ts`.

- **Brand limits are enforced at render.** Fonts, colors and sizes come from lists in `blocks.ts`. Anything else in a document, such as formatting pasted from elsewhere, is dropped. Text is stored as a structured document and only known elements are ever output, so no raw HTML reaches an inbox.
- **Fonts are all ones every inbox can show.** Gmail and most other clients ignore custom web fonts, so the brand's Sunday April and Chainprinter aren't offered. Georgia and Courier New stand in for them.
- **The footer isn't a block.** The postal address and unsubscribe link are always added and can't be removed.
- **Photos.** Uploads are stored twice in the public `email-images` Supabase Storage bucket: `originals/` to recenter from, and `crops/` for what the email loads. A real crop is cut because most inboxes ignore CSS image positioning. Anyone with a photo's link can view it, and files aren't deleted automatically because sent emails still load them.
- **Library photos** live in `public/email/photos/` (default crops) and `public/email/originals/` (for recentering), and are listed in `src/lib/broadcasts/photos.ts`. Logos and library photos load from `APP_URL`, so they only appear for recipients once the app is deployed.
- **Personalization.** `{{first_name|there}}` becomes their first name, or the words after the bar if there isn't one. It works in text and the subject.
- **Templates.** The built-in ones are in `starterContent` in `src/lib/broadcasts/content.ts`. Saved ones are rows in `templates` with `layout_key` set to `custom`.
- **Pre-send check.** `checkBroadcast` lists errors that stop a send, such as a template's placeholder text left in or a link that isn't a web address, and warnings such as missing photo descriptions or an email long enough for Gmail to clip. Each one links to the block it's about.
- **Links are saved as typed.** A half-typed link can't block autosave. It only reaches an email through `normalizeLink`, which adds `https://` to bare addresses and refuses anything else.

## Signup endpoint

`POST /api/subscribe` takes JSON or form data with `email`, optional `name` and `source`, and a hidden `website` honeypot field that must stay empty. It's limited to 10 requests per hour per IP. Set `SIGNUP_ALLOWED_ORIGINS` to the sites allowed to post; with none set, every request is refused.

## DNS (done manually)

- **Sending subdomain** `mail.old-mountain.com`: add the SPF and DKIM records from Resend.
- **DMARC** on the root domain: the record is already at `p=none` but has no reporting. Add a `rua=mailto:` address so reports arrive, and tighten later.
- **Click tracking:** add a CNAME such as `links.old-mountain.com`, pointed at Resend.
- Never send marketing mail from the root domain or Google Workspace.

## Scheduled sync

Inngest runs the Airtable sync every 15 minutes through `/api/inngest`. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in production. Locally, run `npx inngest-cli@latest dev` to trigger it.
