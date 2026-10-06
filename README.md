# The Boulevard Club

A private, mobile-first PWA for a family club. Built with Next.js, TypeScript, Tailwind CSS, Radix/shadcn-style accessible dialog primitives, and Supabase.

Source: [walidsheikh365/BoulevardClubApp](https://github.com/walidsheikh365/BoulevardClubApp).

## Share the public demo on Vercel

The checked-in [Vercel configuration](vercel.json) explicitly builds **demo mode**, with Node.js 22 and the locked dependencies. No environment variables, database, or email provider are required to preview the app.

1. Open [Vercel New Project](https://vercel.com/new) and connect your GitHub account.
2. Import **walidsheikh365/BoulevardClubApp**.
3. Keep **Next.js** as the framework and the repository root (`./`) as the root directory. Use the checked-in build/install commands; leave environment variables empty.
4. Click **Deploy** and share the resulting production `https://...vercel.app` URL. Pushes to `main` can then redeploy automatically.

The preview includes sample data, a demo role selector, and browser-local booking changes. Visitors can explore family, manager and admin views, but **bookings do not sync between visitors or reserve real courts**. Invitations are blocked in both the UI and API.

Do not add real Supabase or service-role credentials to this public demo project. If the share link asks visitors to sign in to Vercel, use the project's production URL rather than a protected preview-deployment URL; check **Settings → Deployment Protection** if needed. Only make the demo publicly accessible.

For the real invite-only club, use a separate Vercel project and follow **Connect Supabase** and **Live deployment** below.

## Local preview

Requires Node.js 22.12+ within the 22.x release line and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. This explicitly enables **demo mode**: sample names and bookings are stored in this browser only. The banner and role selector distinguish the preview from a real club calendar. Email invitations are disabled in the demo. Reset demo restores the sample data.

For a production-mode local preview:

```sh
npm run build
npm start
```

Do not treat demo bookings as reservations. Demo storage is not multi-user or concurrency-safe; the live database is authoritative.

## Agreed rules

- Facilities active at launch: **Football Field, Padel Court 1, Padel Court 2**.
- Time zone: **Asia/Karachi (UTC+5)**, independent of the member's device location.
- Open daily **8:30 am–11:30 pm**, ten fixed **90-minute** sessions:
  8:30, 10:00, 11:30 am; 1:00, 2:30, 4:00, 5:30, 7:00, 8:30, 10:00 pm.
- New bookings and reschedules must start **1–72 hours from now, inclusive**. This is a rolling window, not three calendar days.
- Premium sessions: **5:30–7 pm, 7–8:30 pm, 8:30–10 pm**.
- **One premium booking total per responsible member per Pakistan day across all facilities**.
- Members book in their own name and acknowledge that they will play and remain present for the whole session. Guests cannot use the facilities independently; bookings cannot be offered to others.
- The manager/admin can book on behalf of a named attending member. The daily premium allowance is charged to that member, not the staff account.
- Members can edit/cancel until **2 hours before play, inclusive**. Within two hours, the manager/admin handles changes. Reschedules still require a new start in the 1–72-hour window.
- Staff may cancel an ongoing session, but completed/cancelled sessions cannot be edited. Staff do not bypass booking windows, premium limits, maintenance, or inactive facilities.
- Successful cancellation immediately releases the slot and restores the premium allowance.
- Account/facility deactivation requires cancelling upcoming affected bookings first. Maintenance cannot silently displace existing bookings.

These confirmed choices replace the older brief's variable duration, seven-day window, and initially inactive padel courts. Rule values are intentionally fixed, not arbitrary user-editable settings. Change both the shared rules module and database migration through a tested migration if club policy changes.

## Screens and roles

- **Family:** day/week/month calendar, facility selector, booking, participating-family tags, guest notes, reschedule, cancellation, upcoming/history, and club rules.
- The home screen highlights an upcoming booking, keeps key court hours visible on mobile, and offers a saved night mode with a deep-purple and clay palette.
- **Manager:** member capabilities plus booking on behalf of members, cross-member changes, chronological agenda, native share/copy and printable guard schedule for Ameen Khan and Nawab Khan.
- **Admin:** manager capabilities plus email invitations, member role/access controls, facility activation, maintenance blocks, and latest 100 audit entries.
- Guards have no login. No payments, chat, public registration, automatic WhatsApp messages, email booking notifications, or push notifications.
- The live calendar uses Supabase Realtime and a one-minute refresh fallback with visible connection errors.

## Connect Supabase

No cloud database, credentials, email provider, or deployment is provisioned by this source code.

1. Create a Supabase project.
2. Run [001_club.sql](supabase/migrations/001_club.sql) followed by [002_one_hour_booking_notice.sql](supabase/migrations/002_one_hour_booking_notice.sql) in its SQL editor. On an existing project, apply only migration 002; with the Supabase CLI, use `supabase db push`.
3. In **Authentication → Settings**, **disable new user signups**. The local [config](supabase/config.toml) does this for the Supabase local stack, but does not configure a hosted project automatically.
4. Set the Site URL to your deployed HTTPS origin and allow that origin's `/auth/confirm` URL. Add `http://localhost:3000/auth/confirm` for local development only.
5. Configure production SMTP. Supabase's default email sender has testing restrictions and rate limits. Invitations must be able to reach your family members.
6. Set the **Invite user** email template link to:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Join The Boulevard Club</a>
   ```

   Set the **Reset password** template link to:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset your password</a>
   ```

   These token-hash templates are required for the server-side confirmation flow. Do not rely on a hash-fragment-only default template.

7. Set these environment variables **before building**:

   ```dotenv
   NEXT_PUBLIC_DEMO_MODE=false
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
   NEXT_TELEMETRY_DISABLED=1
   ```

   The service-role key is used only by the server-side admin invitation endpoint. Never put it in a `NEXT_PUBLIC_` variable, commit it, or expose it in the browser.

8. In Supabase Authentication, **invite** your first admin by email after applying the migration. The invitation trigger creates a family profile. Promote only your known admin account in the SQL editor:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (
     select id from auth.users
     where email = 'REPLACE_WITH_YOUR_ADMIN_EMAIL'
   );
   ```

   Verify that exactly one account changed. Follow its invite link and set a password of at least 12 characters.

9. Use the app to invite the remaining family members. Invite Ghulam Rasool, then set his role to **Facility manager**.
10. Test with two independent member sessions against the actual cloud project before opening bookings to the family.

Uninvited Auth users do not automatically receive a club profile. RLS denies them club data even if an Auth account exists. Only active invited profiles can operate the app.

## Booking integrity

[Database migrations](supabase/migrations/001_club.sql) and [002_one_hour_booking_notice.sql](supabase/migrations/002_one_hour_booking_notice.sql) enforce rules inside authenticated, permission-checked RPCs. Callers cannot submit a forged `created_by`; it is taken from `auth.uid()`.

- Fixed start-grid and duration constraints mean overlapping valid sessions necessarily share a start.
- A partial unique `(facility_id, start_time)` index prevents duplicate confirmed slots.
- A partial unique `(responsible_member_id, local_day)` index prevents multiple confirmed premium bookings.
- Booking, maintenance, cancellation, deactivation and membership mutations share a transaction-level advisory lock. A maintenance block cannot race a booking into the same interval.
- Updates are transactional: failed reschedules preserve the original booking and participants.
- Client roles receive read-only table grants and RLS visibility; writes go through the checked RPCs. Audit entries cannot be edited by app users.
- Booking audit entries contain before/after details, participants, responsible member and attendance acknowledgement.

The database cannot prove someone is physically present. The acknowledgement, named responsibility, manager schedule and guards enforce that real-world club policy.

## Live deployment and installation

The checked-in Vercel build command deliberately forces demo mode, even if a dashboard variable says otherwise. For an actual invite-only deployment, remove the `buildCommand` override from [vercel.json](vercel.json), or change it to `npm run build` in a separate live branch. Import that branch into a separate Vercel project, set `NEXT_PUBLIC_DEMO_MODE=false` and the live environment variables, and deploy. Set the matching Supabase Site URL and redirect URLs. Rebuild whenever a `NEXT_PUBLIC_` setting changes. Never turn the shared demo project into the live club accidentally.

- **iPhone:** Safari → Share → Add to Home Screen.
- **Android:** browser menu → Install app / Add to Home Screen; a guided install button appears when the browser offers it.
- HTTPS is required outside localhost.
- No App Store or Google Play submission is required for this PWA.

A small [service worker](public/sw.js) provides installation/offline support instead of `next-pwa`. This deliberately avoids a webpack-specific plugin in the current Next.js/Turbopack build and, more importantly, avoids caching private calendars, API responses or authentication tokens. It caches only public brand assets and a generic offline notice. Bookings are never queued or optimistically confirmed offline. Change its cache version when updating cached artwork.

## Branding

See [BRAND.md](BRAND.md) for the source-photo restoration, completed “rd”, SVG/PNG/icon downloads, palette, font pairings and limitations.

```sh
npm run brand
```

This regenerates the wordmarks and icons from [the original photograph](graphics/image.png), locally. Do not delete the source photo. The interface fonts are bundled locally, with license notices under [public/brand/licenses](public/brand/licenses).

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser suite expects a **demo-mode production build** and uses port 3107. On a minimal Linux installation, Playwright may also need OS browser libraries (`npx playwright install-deps chromium`).

To reproduce Vercel's demo build on Linux/macOS:

```sh
NEXT_PUBLIC_DEMO_MODE=true npm run build
```

- Unit tests verify exact millisecond thresholds, all ten slots, Pakistan dates, ownership, maintenance, premium limits, cancellation, schedule output and paginated reads.
- Database tests execute the actual migration in PGlite PostgreSQL, with a small Auth/role fixture. They exercise RPCs, constraints, privileges, invitation gating and RLS. PGlite serializes connection access: this is **not** a live multi-connection Supabase concurrency/load test.
- Browser tests exercise desktop Chromium and Android-sized Chromium: booking → reload → edit → cancel, premium rejection, staff maintenance, role visibility, calendar views, no horizontal page overflow, logos and manifest. They also verify that the public demo's invitation API rejects requests.
- Live email delivery, hosted Supabase Realtime, real multi-user concurrency, and installation on physical iOS/Android devices still require deployment verification. Mobile Chromium emulation is not a Safari certification.

The installed production dependency audit is clean. The development lint toolchain currently reports an upstream `braces`/`micromatch` advisory through Next's ESLint plugin with no compatible patched release; no unsafe forced downgrade is applied. Do not expose development tooling publicly.
