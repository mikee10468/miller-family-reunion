# White-Label Roadmap — "Family Reunion Hub" as a MEDI-corp product

**Goal:** turn this single-family app into a repeatable product so *any* family can
run their own private reunion hub. A new family should be a **config + provisioning
step**, not a code fork.

> Status: **groundwork started.** The branding layer (below) is in place. Multi-tenancy
> and full string extraction are still to do. This doc is the running plan.

---

## 1. Branding layer — DONE (the "begin to template" step)

All family-specific identity now lives in one place: the `brand` block in
[`assets/js/config.js`](../assets/js/config.js).

```js
brand: {
  familyName, familyCaps, founders, tagline,
  productName, poweredBy, footerBadge, poweredByUrl, themeColor
}
```

Two runtime mechanisms consume it (both injected globally by `config.js`, which
every page loads):

1. **Product badge** — a discrete bottom-right pill: *"A Miller Family Product
   powered by MEDI-corp"* (`#medicorp-badge`; non-clickable by default, becomes a
   link if `brand.poweredByUrl` is set). Driven by `brand.footerBadge`.
2. **`data-brand` text swap** — any element marked `data-brand="familyCaps"` (or any
   brand key) has its text replaced at load. `reels.html`'s subtitle is the
   reference example. `window.MillerBrand.apply(root)` re-applies it after a page
   rebuilds DOM.

**To rebrand for a new family today:** change only the `brand` block (and the
assets in §2). Nothing else *needs* to move for the badge/marked elements to update.

---

## 2. Remaining front-end templating (string + asset extraction)

~175 hardcoded "Miller" references remain across pages. Migrate them to `data-brand`
(for visible text) or JS reads of `MILLER_CONFIG.brand` (for generated strings like
invite messages). Priority order:

| Area | Where | Approach |
|------|-------|----------|
| Page `<title>`s | every `*.html` | set `document.title` from brand, or `data-brand` on a title holder |
| Top-bar subtitles ("THE MILLER FAMILY", "MEMORIES · MILLER FAMILY") | all app pages | wrap the family part in `<span data-brand="familyCaps">` (see `reels.html`) |
| Landing hero / founders / tagline | `index.html` | `data-brand="founders"`, `"tagline"` |
| Invite & SMS copy | `admin.html` | read `MILLER_CONFIG.brand.familyName` in JS |
| Install instructions ("Miller Family icon") | `join.html` | `data-brand="familyName"` |
| PWA manifest name/short_name/icons | `manifest.webmanifest` | per-family manifest (build step or templated) |
| App icons & flyer image | `assets/icons/*`, `family-reunion-flyer_*.jpg` | per-family asset set |
| Theme color | `<meta name="theme-color">` | from `brand.themeColor` |

**Optional:** also mirror the brand block into the `app_settings` DB table so an admin
can edit family name/tagline from the Admin page without a redeploy.

---

## 3. Multi-tenancy (backend) — the enterprise step

Two viable models:

### Option A — one Supabase project per family *(recommended to start)*
- **Pros:** hard data isolation for free, matches today's architecture, simplest RLS
  (no tenant scoping to get wrong), per-family billing (each family on Free until
  video pushes them to Pro — see [reels cost notes](#5-cost--ops)).
- **Cons:** provisioning is N projects; schema upgrades must be applied to each
  (scriptable via the Supabase Management API / CLI).
- **Fit:** great for tens of families; operationally heavier at hundreds.

### Option B — one shared project, `tenant_id` on every row
- Add `tenants` table; add `tenant_id uuid` to every table (persons, photos, posts,
  messages, app_settings, …); scope **every** RLS policy with
  `tenant_id = auth.jwt() ->> 'tenant_id'` (or a membership lookup).
- Storage: prefix every object path with `tenant_id/` and enforce it in storage
  policies (today paths start with `auth.uid()`; prepend tenant).
- **Pros:** one schema, one deploy, cheap at scale.
- **Cons:** a single RLS mistake crosses families — needs careful review + tests;
  noisy-neighbor and shared quotas.

**Recommendation:** ship Option A for the first external families (lowest risk),
design the schema now so Option B is a later migration if volume demands it.

---

## 4. Provision a new family (checklist)

1. Create the family's Supabase project (Option A) → copy URL + anon key.
2. Copy this repo (or a release) → set `MILLER_CONFIG.SUPABASE_*` + the whole
   `brand` block.
3. Drop in the family's icons, flyer, and `manifest.webmanifest` name.
4. Apply the SQL schema files in order (see `supabase/`), seed `app_settings`.
5. Set event details (date/venue) — ideally DB-driven via the Events tables.
6. Deploy (GitHub Pages or any static host) → hand over the admin account.

A future `scripts/new-family.*` can automate steps 1–4.

---

## 5. Cost & ops

- Each family on **Supabase Free** (≈1 GB storage, ≈5 GB egress/mo) covers tree +
  photos comfortably. **Reels (video) require Pro ($25/mo/family)** — see the
  `reels-and-plan` notes. Enterprise pricing should pass this through (or bundle).
- Edge Functions (push, recovery, guest passes) deploy per project in Option A.
- Keep a single source-of-truth schema in `supabase/` so every tenant stays in sync.

---

## 6. Open product questions

- Billing model: per-family subscription vs. seat-based vs. freemium (free tree +
  photos, paid reels/video)?
- Custom domains per family?
- Centralized super-admin console across tenants (Option B makes this natural)?
- Data ownership / export + delete guarantees per family (privacy).
