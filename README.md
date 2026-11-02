# Miller Family & Friends — App

A lifetime family hub for the **Lawrence & Lula Miller Family & Friends Day** (July 3, 2027, Mellon Park, Pittsburgh) and future reunions.

This is an **installable web app (PWA)** — family members open it in a browser and "Add to Home Screen" to use it like an app. No app store, no fees.

## Status

**Step 1 — Landing page (done).** Flyer, countdown, event details, "Add to Calendar", Request Access form, share buttons, and installable-to-phone support.

**Step 2 — Backend (done & connected).** Supabase project live; access-request → admin/elder approval → invite-code flow; magic-link sign-in; roles (admin/elder/member) with Row-Level Security. Admin panel at `admin.html`, sign-in at `login.html`. Keys are in `assets/js/config.js`.
> Before public launch: update **Auth → URL Configuration** to the real deploy URL, and set up a custom email sender (e.g. Resend) — Supabase's built-in email is rate-limited.

**Step 3 — Family tree (done & verified).** Interactive, collapsible descendant tree at `tree.html` (active members only), seeded with Lawrence & Lula + 10 children. Members propose add/edit/add-child/add-spouse; every change waits in the **Tree Review** queue until an elder/admin approves it (admin panel). Schema: `supabase/schema_tree.sql`.

**Step 4 — Photos (done & verified).** `photos.html` gallery; members upload up to **3 photos free** (limit enforced by a DB trigger, configurable in `app_settings.photo_limit`), stored in a **private** `family-media` bucket and shown via signed URLs. Owners (and admins) can remove photos. **Video uploads are gated off** (`app_settings.videos_enabled=false`) until you set a fee. Schema: `supabase/schema_media.sql`.

**Step 5 — Event RSVP / potluck / volunteers (done & verified).** `event.html`: members RSVP with a party headcount, claim a dish/supplies in the **"What I'm Bringing"** potluck list, and sign up for the flyer's **volunteer roles** (Setup, Cleanup, Kids' Games, Flag Football, Volleyball, Karaoke). A live headcount banner totals who's coming. Schema: `supabase/schema_event.sql`.

The family tree also grows **upward** — members can "Add a parent" to extend generations before Lawrence & Lula (schema `supabase/schema_tree_v2.sql`) — and person **photos** show on the tree (e.g. elder **Levi Miller**, in `Levi_Miller/`).

**Step 6 — Admin settings (done & verified).** `admin.html` has an admin-only **Settings** tab to change the free-photo limit and turn **video uploads on/off** — no database editing. (The app never processes payments; collect any video fee separately.)

### Still optional / to do
- Populate the grandchildren shown in `family_tree structure.jpg` (ask and I'll add them).
- Set your family **Facebook page URL** in `assets/js/config.js` (`facebookPageUrl`) for the share button.
- **Deploy** to the web (GitHub Pages path ready) and update Supabase **Auth → URL Configuration** to the live URL.
- Add a custom **email sender** (e.g. Resend) for access-request alerts and reliable sign-in emails at family scale.
- Step 6 — Admin panel + social sharing polish

## Run locally

Any static file server works. With Node installed:

```sh
npx serve .
# or
npx http-server -p 8080
```

Then open the printed URL (e.g. http://localhost:3000). Use a phone or Chrome's device toolbar to see the mobile layout. The service worker and "Add to Home Screen" require **https** (or localhost).

## Deploy (free options)

Drag-and-drop or connect this folder to any of:
- **Netlify** / **Cloudflare Pages** / **Vercel** — free static hosting with free https.
- **GitHub Pages** — free.

All of these give the https needed for installability and a shareable link.

## Configuration

Edit the `CONFIG` block at the top of `assets/js/app.js`:
- `adminEmail` — where "Request Access" emails go (currently your AOL address; it's visible in the page's mailto link — we'll replace this with the backend form in Step 2).
- `facebookPageUrl` — set your family Facebook page/group URL to make the Facebook button link there.
- Event date/location are also there if anything changes.

## Files

```
index.html                     landing page
manifest.webmanifest           PWA manifest (name, icons, theme)
service-worker.js              offline caching
assets/css/styles.css          styling (royal purple + gold)
assets/js/app.js               countdown, calendar, form, share, install
assets/icons/                  generated app icons (M monogram)
family-reunion-flyer_2027.jpg  the event flyer
```
