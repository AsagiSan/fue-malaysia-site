# Go-live checklist (about 20 minutes)

For the person who owns the clinic's Vercel and GitHub accounts (Salim).

## 1. Put the code on GitHub
Create a private repository, then push this folder to it. `.env` files are already git-ignored.

## 2. Import into Vercel
Vercel → **Add New → Project** → pick the repository. Framework preset: **Other**. Leave build and output settings as they are (`vercel.json` sets everything). Do not deploy yet if you want to add settings first; deploying first is fine too, you will redeploy after step 4.

## 3. Connect storage (both are in the Vercel dashboard)
1. **Storage → Create → Blob.** Connect it to the project. This adds `BLOB_READ_WRITE_TOKEN` automatically. Keep the store's access **Public** (pictures are public on the website).
2. **Storage → Marketplace → Upstash Redis → Create.** Connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically (any region; free plan is enough).

## 4. Add two environment variables
Project → **Settings → Environment Variables** (Production, Preview, Development):
| Name | Value |
|---|---|
| `SESSION_SECRET` | A long random text, 32+ characters. Generate one: `openssl rand -base64 48` |
| `SETUP_TOKEN` | Any one-time code you invent (12+ characters). Used once, in step 6. |

Optional: `SITE_URL=https://www.fuemalaysia.com`.
Then **Deployments → Redeploy** so the new variables apply.

## 5. Point the domain
Project → **Settings → Domains** → add the clinic's domain and follow Vercel's DNS instructions.

## 6. First sign-in
1. Open `https://YOUR-DOMAIN/admin`.
2. Enter the `SETUP_TOKEN`, then name, email and a password for the first **owner**.
3. **Team → Add a person** for everyone else (owners: you, Dr. Inder, Salim; admins: assistant, clinic admin). Each person gets a temporary password to send privately and must choose their own at first sign-in.
4. Afterwards you may delete `SETUP_TOKEN` from Vercel. Setup can only run while there are no users.

## 7. Google codes
**Admin → Tracking codes.** Paste the Search Console / Ads / Analytics / Tag Manager snippets (see the on-screen help), Save. Check with View Source on any page, then verify in Search Console. SEO fields and schema are under **SEO & Schema** (test schema at https://search.google.com/test/rich-results).

## 8. Check it works
- Visit `/admin`, sign in, replace one picture on **Pictures**, wait a minute, refresh the public page.
- `https://YOUR-DOMAIN/sitemap.xml` and `/robots.txt` use `www.fuemalaysia.com`; edit `public/robots.txt` and `public/sitemap.xml` if the final domain differs.

## Things to know
- Edits appear within about 60 seconds (page cache). Pictures too.
- Pictures are limited to JPG, PNG or WebP, max about 4 MB after the automatic compression.
- If someone forgets their password, an owner uses **Team → Reset password**. If every owner is locked out: delete the Redis key `fue:users` in the Upstash console, set a new `SETUP_TOKEN`, and run first sign-in again.
- To change page design or text, edit files in `templates/`.
- **No template edit is needed for pictures any more.** Adding, removing and re-ordering photos in the multi-photo sections is done in **Admin → Photo galleries**, and a brand-new picture anywhere on any page is added in **Admin → Extra pictures**. To make *another* repeated section editable as a gallery, add `data-gallery="my-id" data-gallery-label="Name shown in admin"` to its container element (all direct children must be the repeating items; add `data-gallery-var="--n"` if its CSS uses a column-count variable such as `--n`). New `<img src="images/your-file.webp">` tags added to templates show up under **Pictures** automatically.
- Privacy/Terms wording should be reviewed by the clinic's legal adviser.
