# Payload admin remounts the whole page after a client-side login

Minimal reproduction: the unmodified `blank` template from `create-payload-app@3.92.0` (which
installs Payload 3.93.0), switched to SQLite so it runs with no database server. The only file
added is `scripts/measure.mjs`.

## The bug

After logging in through the default login form, the page the user lands on (`/admin`) renders
twice, and the second render does not reuse the first. React unmounts the whole page subtree (nav,
header, dashboard) and mounts a new one. A keyboard user who presses Tab right after landing loses
the focus to `<body>`.

Cause: `PageConfigProvider` (`packages/ui/src/providers/Config/index.tsx`) wraps its children in a
nested `ConfigProvider` while the root config is still the unauthenticated one from the login page,
then returns them unwrapped once its effect has updated the root. The element type changes between
the two renders, so React remounts the subtree.

## Run it

```bash
cp .env.example .env
pnpm install
pnpm dev                                # or: pnpm build && pnpm start
node scripts/measure.mjs http://localhost:3000 20
```

The script creates the first user (`dev@example.com` / `test1234`) when there is none. Then, 20
times in a fresh browser context, it logs in through the form, presses Tab as soon as the URL is
`/admin`, and 500 ms later records where the focus is and whether the template's DOM node was
removed.

## Measured (Chromium through Playwright, macOS)

| Build | Focus kept | Template remounted |
|---|---|---|
| `pnpm dev` | 2/20 | 20/20 |
| `pnpm build && pnpm start` | 0/20 | 20/20 |
| `pnpm build && pnpm start`, proposed fix applied to `@payloadcms/ui` | 20/20 | 0/20 |

The proposed fix (always render `RootConfigContext` and change only its value) is in the issue.

## Manual check

1. Open `/admin`, create the first user, then log out.
2. In DevTools, add a `MutationObserver` on `document.body`, or turn on React DevTools "Highlight
   updates".
3. Log in with the form. Right after the URL becomes `/admin`, the `div` holding the template is
   removed and replaced by a new one of the same shape.
4. After a full reload of `/admin`, it does not happen.
