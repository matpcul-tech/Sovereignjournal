# The Sovereign Journal

A daily writer for sovereign AI infrastructure and Adaptive Inclusive Leadership Theory. Every morning a GitHub Action reads your research, writes one entry in your voice, commits it, Vercel publishes the blog, and the cut goes to LinkedIn, Facebook, and X with the photograph.

No database. No server. Cost is the Anthropic API call, roughly $0.10 to $0.30 a day on Sonnet.

## How it runs

1. `scripts/write.mjs` picks the next theme from `themes.json`, loads the research files that theme lists from `research/`, and asks Claude for the piece plus a social cut. It writes `src/content/posts/YYYY-MM-DD-theme.md`.
2. The workflow commits and pushes. Vercel deploys the Astro site.
3. `scripts/post-linkedin.mjs` posts the cut to your LinkedIn profile with the photograph as the article thumbnail.
4. `scripts/post-facebook.mjs` posts the same cut to your Facebook Page as a link card (photograph from `og:image`). If the link scrape fails, it posts the photograph itself.
5. `scripts/post-x.mjs` posts a short cut to X with the photograph attached.

## Setup (about 30 minutes)

### 1. Repo and Vercel
- Push this folder to a new GitHub repo.
- In Vercel, import the repo. Framework is detected as Astro. Deploy. Note the URL (or add your own domain).
- Vercel redeploys on every push, which is how each morning's post goes live.

### 2. GitHub Actions secrets and variables
Repo Settings > Secrets and variables > Actions.

Secrets:
- `ANTHROPIC_API_KEY`
- `LINKEDIN_ACCESS_TOKEN` (see section 3)
- `LINKEDIN_AUTHOR_URN` (see section 3)
- `FACEBOOK_PAGE_ACCESS_TOKEN` (see section 4)
- `FACEBOOK_PAGE_ID` (see section 4)
- `X_API_KEY` (see section 5)
- `X_API_SECRET` (see section 5)
- `X_ACCESS_TOKEN` (see section 5)
- `X_ACCESS_TOKEN_SECRET` (see section 5)

Variables:
- `SITE_URL` = your Vercel URL with no trailing slash, for example `https://sovereignjournal.vercel.app`
- `ANTHROPIC_MODEL` (optional, defaults to `claude-sonnet-4-6`)

Also set `SITE_URL` as an environment variable in the Vercel project so canonical links and RSS use the right host.

### 3. LinkedIn (one time, then every 60 days)
Tokens for your own profile last about 60 days. When one expires the workflow fails on the LinkedIn step and GitHub emails you. Redo step d and update the secret.

a. Go to linkedin.com/developers, create an app. It must be attached to a LinkedIn Page you admin (a company page for Sovereign Shield Technologies works). Verify the app from the page.
b. In the app's Products tab, request "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect". Both are self-serve.
c. In the Auth tab, add a redirect URL. `https://localhost/callback` is fine for a one-person setup.
d. Get a token. Open this in a browser, with your client id and the redirect URL filled in:

```
https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=CLIENT_ID&redirect_uri=https%3A%2F%2Flocalhost%2Fcallback&scope=openid%20profile%20w_member_social
```

Approve. The browser lands on localhost with `?code=...` in the address bar. Copy the code, then exchange it (from a terminal, or paste into Claude Code):

```
curl -X POST https://www.linkedin.com/oauth/v2/accessToken \
  -d grant_type=authorization_code \
  -d code=THE_CODE \
  -d redirect_uri=https://localhost/callback \
  -d client_id=CLIENT_ID \
  -d client_secret=CLIENT_SECRET
```

The response contains `access_token`. That is `LINKEDIN_ACCESS_TOKEN`.

e. Get your author URN:

```
curl https://api.linkedin.com/v2/userinfo -H "Authorization: Bearer ACCESS_TOKEN"
```

The `sub` field is your member id. `LINKEDIN_AUTHOR_URN` is `urn:li:person:` followed by that id.

### 4. Facebook Page (one time)

Facebook will not post to a personal profile from an app. It posts as a Page you admin (Sovereign Shield, Sovereign Creations, or a journal page).

a. Create or pick the Page. You must be an admin.
b. Go to [developers.facebook.com](https://developers.facebook.com/apps/), create an app, type **Business**.
c. Add the **Facebook Login** product if asked. In App Review / permissions, you need `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`.
d. In [Graph API Explorer](https://developers.facebook.com/tools/explorer/):
   - App: the one you just created
   - User or Page: get a User token with those three permissions
   - `GET /me/accounts`
   - Copy the Page `id` (`FACEBOOK_PAGE_ID`) and that Page's `access_token`
e. Exchange the Page token for a long-lived one (this is the secret that should last months, sometimes until you change your Facebook password):

```
curl -G https://graph.facebook.com/v23.0/oauth/access_token \
  --data-urlencode "grant_type=fb_exchange_token" \
  --data-urlencode "client_id=APP_ID" \
  --data-urlencode "client_secret=APP_SECRET" \
  --data-urlencode "fb_exchange_token=PAGE_OR_USER_TOKEN"
```

Put the long-lived token in `FACEBOOK_PAGE_ACCESS_TOKEN`. Do not commit it.

Until those two secrets exist, the Facebook step logs a skip and the rest of the morning job still runs.

### 5. X (one time)

X posts from your own account. You need a developer app with **Read and write**.

a. Go to [developer.x.com/en/portal/dashboard](https://developer.x.com/en/portal/dashboard). Create a Project and an App.
b. User authentication settings: App permissions **Read and write**. Type of App: Native. Callback URL can be `https://localhost/callback`.
c. Keys and tokens: generate **API Key and Secret**, then **Access Token and Secret** for your account (not a Bearer-only app token).
d. Put them in Actions secrets:

- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`

The tweet is the first lines of the daily cut, under 280 characters, with the photograph attached and the journal URL for the card. Until the four secrets exist, the X step skips.

### 6. Research
Drop your material into `research/` as markdown or plain text, then list the file names in `themes.json` under the themes that should use them. Start with:
- `ailt-core.md` : replace the notes with the manuscript text or the chapters you want quoted from.
- `sovereign-shield-thesis.md` : curated from the Command Center. Investor and security sections were left out on purpose.
- `voice.md` : the voice guide. This is the file that keeps the writing sounding like you. Edit it whenever a post reads wrong.

### 7. First run
Actions tab > Daily journal > Run workflow. Check the blog, check LinkedIn, paste into Medium. Then leave it alone.

## Controls
- Pause everything: set `"paused": true` in `config.json` and push.
- Blog only: set `"postToLinkedIn": false`, `"postToFacebook": false`, and `"postToX": false`.
- Change the hour: edit the cron in `.github/workflows/daily.yml` (11:00 UTC is 6:00 AM Central during daylight time).
- Change the order or add themes: edit `themes.json`. `state.json` tracks where the rotation is; set `nextTheme` to 0 to restart it.
- Write an extra piece today from your phone: Actions > Run workflow. The script refuses to write twice on the same day unless you run `npm run write -- --force` locally.
- Fix a post: edit the markdown in `src/content/posts/` and push. Vercel redeploys. LinkedIn does not repost.

## Local
```
npm install
cp .env.example .env   # fill in keys
export $(cat .env | xargs)
npm run write
npm run dev
```
