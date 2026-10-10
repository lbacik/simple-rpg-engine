# Research: Next.js architecture for a server-authoritative game engine

Ticket: [#5](https://github.com/lbacik/simple-rpg-engine/issues/5) (child of map [#1](https://github.com/lbacik/simple-rpg-engine/issues/1)).
Date: 2026-10-10. Status: findings only. **No decision is made here**; a later grilling ticket decides.

Vocabulary follows `CONTEXT.md`: Scenario, Location, Scene, Session, Playthrough, Character.

## Versions checked

| Package | Latest on npm (2026-10-10) | Notes |
| --- | --- | --- |
| `next` | 16.4.0 (`latest`) | Docs read at tag `v16.2.9` (the newest tag Context7 indexes; the 16.x API surface below has not changed since 16.0) |
| `better-sqlite3` | 13.0.3 | |
| `drizzle-orm` | 0.45.4 (`latest`); 1.0.0-rc.x on `rc` | `node-sqlite` driver exists only in the 1.0 beta/rc line (see §4) |
| `tsx` | 4.23.15 | |
| Node.js `node:sqlite` | Stability 1.2 (release candidate) since v25.7.0 | |

Source: `npm view <pkg> dist-tags` / `exports`.

---

## 1. Anonymous cookie-based Sessions (no auth)

### Facts

- `cookies()` from `next/headers` is **async** (`await cookies()`). It can **read** cookies in Server Components, and **read and write** them only in Server Functions (Server Actions) and Route Handlers. [cookies.mdx, l.6][cookies]
- "**Setting cookies is not supported during Server Component rendering.** To modify cookies, invoke a Server Function from the client or use a Route Handler." [cookies.mdx, l.75-80][cookies] This is an HTTP limitation: headers have already been streamed when a component renders.
- After a cookie mutation inside a Server Action, Next.js re-renders the current page and its layouts. [mutating-data.mdx][mutating]
- **Proxy** (the Next 16 name for Middleware; `middleware.ts` is deprecated and renamed to `proxy.ts`, function `proxy`) runs before routes render and can set cookies on the response via `NextResponse.next().cookies.set(...)`. It can also forward modified **request** headers with `NextResponse.next({ request: { headers } })`, so the same request's render can see a newly-minted value. [proxy.mdx, l.10-22, ~l.390][proxy]
- Proxy runtime is **Node.js by default** in Next 16; the `runtime` segment option is not allowed in Proxy and throws. Edge is only available by staying on the deprecated `middleware` file. [proxy.mdx, l.221-223, version table l.774][proxy], [version-16 upgrade guide][v16]
  - Doc inconsistency to be aware of: the Self-Hosting guide still says "Proxy uses the Edge runtime" [self-hosting.mdx][selfhost]; the Proxy reference and the v16 upgrade guide (authoritative for the file) say Node.js.
- Proxy runs on **every request** unless a `matcher` is configured (including `_next/static`, images, `public/`). Server Functions are not separate routes: they are POSTs to the page's route, so a matcher that excludes a path also skips the Server Functions on it. Next recommends verifying identity inside each Server Function rather than relying on Proxy alone. [proxy.mdx, l.75, l.206-219][proxy]
- Proxy "should not attempt relying on shared modules or globals" (it may be deployed separately, e.g. to a CDN). [proxy.mdx, l.19][proxy] Practically: Proxy should not open the SQLite database.
- Recommended session-cookie options in the auth guide: `httpOnly`, `secure`, `sameSite: 'lax'`, `expires`/`maxAge`, `path: '/'`. [authentication guide][auth]

### Options for minting the Session id

| Option | How | Trade-offs |
| --- | --- | --- |
| A. Proxy mints | `proxy.ts`: if no `sid` cookie, generate `crypto.randomUUID()`, set it on the response and on forwarded request headers | Cookie exists from the first page load; Server Components can read it immediately. Needs a matcher to skip static assets. Proxy must not touch the DB, so the Session row is created lazily on first write. |
| B. Lazy mint in a Server Action | The first mutating action (e.g. "start Playthrough") creates the cookie + Session row | No Proxy at all. Read-only pages must cope with "no Session yet" (show empty Playthrough list). Fits the rule that only Server Functions/Route Handlers write cookies. |
| C. Route Handler bootstrap | e.g. `GET /api/session` sets the cookie and redirects | Extra round trip; mostly useful if a non-Next client (the CLI?) ever needs a Session — not in scope. |

Cookie value: an opaque random id (lookup key into the store) is the simplest; signing/encrypting (the auth guide uses `jose`) is only needed if the cookie carries data rather than a key. [auth]

---

## 2. Server Actions vs Route Handlers for game turns

### Facts

- A Server Function is an async function run on the server and called from the client over the network; in a mutation context it is a Server Action. It is invoked via **POST**, can be used as `<form action>` / `formAction`, and Next can "return both updated UI and new data in a single server roundtrip". [mutating-data.mdx][mutating]
- Forms bound to Server Actions in Server Components work **without JavaScript** (progressive enhancement). [mutating-data.mdx, l.131][mutating]
- "The client currently dispatches and awaits them **one at a time**. This is an implementation detail and may change." [mutating-data.mdx, l.206][mutating] Relevant to turn ordering within one tab; it says nothing about two tabs on the same Playthrough.
- Security model: every exported Server Action is reachable by **direct POST**, not only through the UI; action IDs are encrypted, non-deterministic, recalculated between builds; actions must verify authorization themselves. Next compares `Origin` to `Host`/`X-Forwarded-Host` and aborts on mismatch (CSRF mitigation; `serverActions.allowedOrigins` for reverse proxies). [data-security.mdx, l.276-286, l.538-553][datasec]
- Return values are serialized to the client — "only return what the UI needs". [data-security.mdx, l.435][datasec] Closed-over variables in inline actions are encrypted, with a per-build key; multi-instance self-hosting needs `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. [data-security.mdx, l.474-536][datasec]
- Route Handlers (`app/**/route.ts`) are plain Web `Request`/`Response` handlers for any HTTP method; they are the only option for externally reachable endpoints (webhooks, non-browser clients). `GET` handlers are dynamic (uncached) by default since v15. [route.mdx][route]

### Comparison for "submit a choice / roll the dice"

| Aspect | Server Action | Route Handler |
| --- | --- | --- |
| Call site | Form/button in RSC or Client Component; typed function import | `fetch('/api/...')` from a Client Component |
| Cookie write | Yes | Yes |
| UI refresh after turn | Built in (re-render / `revalidatePath`, `redirect`) | Client must refetch or `router.refresh()` |
| No-JS play | Yes (forms) | No |
| Non-browser client / public API | No (same-origin, build-bound IDs) | Yes |
| Ordering | Client serializes calls (implementation detail) | None; client controls |
| Input validation | Must validate `FormData`/args (reachable by direct POST) | Must validate body |

In both cases the server must treat the client's choice as an untrusted request: re-check that the chosen option is legal for the current Playthrough state before applying it (server-authoritative). Concurrency across tabs is not handled by either mechanism; a version/turn counter on the Playthrough row (compare-and-set) is the usual guard.

---

## 3. Running a pure TypeScript engine module on the server

- Route segment `runtime` option: `'nodejs'` (**default**) or `'edge'`; edge is not supported with Cache Components and not allowed in Proxy. [runtime.mdx][runtime] Pages, Server Actions and Route Handlers therefore run on full Node.js unless opted out — a native module like `better-sqlite3` works there.
- Server code is bundled by Next. Packages using Node-specific features can be excluded with `serverExternalPackages`; **`better-sqlite3` is already on Next's built-in auto-external list** (so is `sqlite3`, `@libsql/client`). [serverExternalPackages.mdx, l.47, l.91][sep]
- `import 'server-only'` makes importing a module from a Client Component a build error. [data-security guide][datasec] **Caveat for sharing with a CLI:** the `server-only` npm package's `default` export condition is a file that **throws** on import; only the `react-server` condition resolves to an empty file. So a module imported by a plain Node CLI must not import `server-only` itself — put the guard in a Next-only wrapper (e.g. the persistence/adapter layer). Verified by inspecting the published package (`exports: { "react-server": "./empty.js", "default": "./index.js" }`, `index.js` = `throw new Error(...)`).
- `instrumentation.ts` `register()` runs **once** per server instance before requests are served — a candidate hook for "validate the Scenario directory on startup" and for opening the DB / running migrations. Guard with `process.env.NEXT_RUNTIME === 'nodejs'`. [instrumentation.mdx, l.16-18, l.111-113][instr]
- A pure engine module (no I/O, deterministic given an injected RNG) is a library concern, not a Next concern; nothing in Next constrains it beyond being importable by the server bundle. Injecting the RNG keeps it testable and makes "dice rolled on the server" a property of the caller, not the engine.

---

## 4. Simple persistence and its deployment constraints

### SQLite via better-sqlite3

- Synchronous API, full transactions; author claims "better concurrency than an asynchronous API". Recommends `db.pragma('journal_mode = WAL')`. [better-sqlite3 README][bsq], [performance.md][bsqperf]
- WAL "checkpoint starvation" only matters with simultaneous access from multiple processes/threads. [performance.md][bsqperf] A CLI validator that does not open the DB, plus a single Next server process, avoids it.
- SQLite is serialized: long queries + many users do not scale, but the author reports ~2000 qps with 5-way joins on 60 GB. [README "When is this library not appropriate?"][bsq] Far beyond a single-player prototype's needs.
- Native module: prebuilt binaries for major platforms; otherwise needs a compile toolchain. [README][bsq] Docker images must match the build platform (install inside the image).

### Drizzle ORM

- `drizzle-orm/better-sqlite3` driver + `drizzle-orm/better-sqlite3/migrator` `migrate(db)`; `drizzle-kit generate` writes SQL migration folders, `drizzle-kit push` applies schema diffs directly (prototype-friendly). [Drizzle SQLite migrations][drizzlemig], [Drizzle get-started SQLite][drizzlestart]
- `drizzle-orm/node-sqlite` (Node's built-in `node:sqlite`, no native addon) appears in the docs but is **only exported by the 1.0 beta/rc line**, not by `latest` 0.45.4 (checked `npm view drizzle-orm@latest exports` vs `@beta`).
- `node:sqlite` itself: added v22.5.0, unflagged v22.13/v23.4, **release candidate (Stability 1.2) since v25.7.0**, not yet stable. [Node sqlite docs][nodesqlite]

### File store (JSON per Playthrough)

- No dependency; trivially inspectable. Needs atomic writes (write temp + rename) and its own concurrency guard. Same filesystem constraints as SQLite below.

### Deployment constraints

| Target | Writable persistent disk? | Consequence |
| --- | --- | --- |
| Self-hosted `next start` / `output: 'standalone'` (VPS, Docker with a volume) | Yes | SQLite file or JSON store works as-is. `standalone` copies only traced files; `public/` and `.next/static` must be copied manually; files outside the app dir (e.g. a Scenarios dir, a monorepo package) need `outputFileTracingRoot` / `outputFileTracingIncludes`. [output.mdx, l.24-47, l.69-154][output] Next's own cache is per-instance on local disk; multiple instances need coordination. [self-hosting.mdx, l.89-111][selfhost] |
| Vercel Functions (Node) | **No.** "Read-only filesystem with writable `/tmp` scratch space up to 500 MB"; functions are archived when idle and scale to many instances | A local SQLite/JSON file would be per-instance and ephemeral — Playthroughs would be lost. Requires a network DB (e.g. libSQL/Turso, Postgres) instead. [Vercel runtimes][vercel] |
| Edge runtime | No Node APIs / native modules | Not viable for better-sqlite3 or `fs`. [runtime.mdx][runtime] |

Implication: "simple store = local file" ties the prototype to a **single long-lived Node process with a persistent disk**. Keeping the store behind a small repository interface leaves a path to a networked SQLite-compatible DB (Drizzle has a libSQL driver) if serverless hosting is ever wanted.

Dev-mode note (common practice, not from the docs above): Next dev reloads modules on change; a DB connection is usually cached on `globalThis` to avoid opening many handles.

---

## 5. Sharing engine/validator code with a standalone Node CLI

The validator CLI (map #1: "validation command, CLI/CI or on startup") and the Next server should import the same engine + Scenario schema code.

### Layout options

| Option | Shape | Notes |
| --- | --- | --- |
| A. Single package | One `package.json`; `src/engine/**` pure TS; Next app in `app/`; CLI at `scripts/validate.ts` run with `tsx` | Simplest. CLI and app share `tsconfig` paths. Discipline (lint rule / folder convention) keeps the engine free of Next imports. |
| B. npm workspaces | Root `package.json` `"workspaces": ["packages/*", "apps/*"]`; `packages/engine`, `apps/web` (Next), CLI as a `bin` of `packages/engine` or its own package | npm symlinks each workspace into root `node_modules` during `npm install`. [npm workspaces docs][npmws] Package boundary enforces the "engine has no Next dependency" rule. Next can consume an unbuilt TS workspace package via `transpilePackages: ['@x/engine']`. [transpilePackages.mdx][transpile] With `output: 'standalone'`, set `outputFileTracingRoot` to the repo root. [output.mdx, l.69-76][output] |

### Running TypeScript in the CLI

- **tsx**: "think of `tsx` as an alias to `node`"; esbuild-based, **no type checking** (run `tsc --noEmit` separately in CI); CJS↔ESM interop; watch mode. [tsx docs: index, typescript.md][tsx]
- **Native Node type stripping**: on by default since v23.6 / v22.18, **stable since v25.2 / v24.12**. Limits: no `enum`, no runtime `namespace`, no parameter properties, no decorators; **imports must use `.ts` extensions**; `tsconfig.json` (incl. `paths`) is ignored (use `#` subpath imports); **refuses TS files under `node_modules`**. [Node TypeScript docs][nodets] Implication: if the engine is written in the "erasable syntax only" subset with explicit `.ts` imports, the CLI can run on plain `node` with no tooling. Whether workspace symlinks under `node_modules` trip the `node_modules` rule depends on Node resolving them to their real path (its default without `--preserve-symlinks`) — **unverified, would need a quick prototype**.
- **Precompile** (`tsc` → `dist/`): most robust for publishing; adds a build step.

---

## Constraints summary (for the grilling ticket)

1. Cookies can only be **written** in Server Actions, Route Handlers or Proxy — never during Server Component render. First-visit Session minting therefore needs Proxy (option A) or lazy minting on first action (option B).
2. Next 16 Proxy is Node.js runtime by default, but should not rely on shared modules/globals → don't open the DB there.
3. Server Actions are publicly POST-able, same-origin-checked, build-bound; every turn action must re-validate Session ownership and move legality on the server.
4. Server Actions give no-JS forms + single-roundtrip UI refresh; Route Handlers are needed only for non-browser clients.
5. A local SQLite/JSON store requires a **single persistent Node host** (self-hosted / Docker volume). Vercel-style serverless has a read-only FS (500 MB ephemeral `/tmp`) → needs a network DB.
6. `better-sqlite3` is auto-externalized by Next; works on the default `nodejs` runtime; native binary must match the deploy platform.
7. Drizzle `latest` (0.45.x) supports better-sqlite3; `node:sqlite` support only in Drizzle 1.0 beta/rc, and `node:sqlite` itself is RC, not stable.
8. Shared engine code must not import `server-only` or anything from `next/*` (the `server-only` package throws outside the `react-server` condition).
9. CLI can run TS via `tsx` (any TS syntax, no type check) or native Node type stripping (erasable syntax + `.ts` import extensions only).
10. `instrumentation.ts` `register()` is the startup hook for "validate Scenarios on startup" / migrations.

## Open questions for the decision ticket

- Hosting target: self-hosted single Node process (local file store OK) vs serverless (needs network DB)?
- Session minting: Proxy vs lazy-on-first-action?
- Turn transport: Server Actions only, or Route Handlers too?
- Store: better-sqlite3 + Drizzle, raw better-sqlite3, or JSON files? Migrations via `drizzle-kit push` or generated SQL?
- Repo shape: single package vs npm workspaces? CLI via `tsx` or native type stripping?
- Concurrency guard for the same Playthrough open in two tabs (version counter?).

## Sources

[cookies]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/04-functions/cookies.mdx
[mutating]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/01-getting-started/07-mutating-data.mdx
[proxy]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/03-file-conventions/proxy.mdx
[v16]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/upgrading/version-16.mdx
[auth]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/authentication.mdx
[datasec]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/data-security.mdx
[route]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/03-file-conventions/route.mdx
[runtime]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.mdx
[sep]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.mdx
[instr]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/03-file-conventions/instrumentation.mdx
[output]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/05-config/01-next-config-js/output.mdx
[selfhost]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/self-hosting.mdx
[transpile]: https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/05-config/01-next-config-js/transpilePackages.mdx
[vercel]: https://vercel.com/docs/functions/runtimes
[bsq]: https://github.com/WiseLibs/better-sqlite3/blob/master/README.md
[bsqperf]: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md
[drizzlemig]: https://orm.drizzle.team/docs/migrations
[drizzlestart]: https://orm.drizzle.team/docs/get-started-sqlite
[nodesqlite]: https://nodejs.org/api/sqlite.html
[nodets]: https://nodejs.org/api/typescript.html
[npmws]: https://docs.npmjs.com/cli/using-npm/workspaces
[tsx]: https://github.com/privatenumber/tsx/tree/master/docs

- Next.js docs (v16.2.9 source): [cookies][cookies], [mutating data][mutating], [proxy][proxy], [v16 upgrade][v16], [authentication][auth], [data security][datasec], [route handlers][route], [runtime][runtime], [serverExternalPackages][sep], [instrumentation][instr], [output][output], [self-hosting][selfhost], [transpilePackages][transpile]
- Vercel: [Functions runtimes][vercel]
- better-sqlite3: [README][bsq], [performance][bsqperf]
- Drizzle: [migrations][drizzlemig], [get started SQLite][drizzlestart]; npm `drizzle-orm` dist-tags/exports
- Node.js: [`node:sqlite`][nodesqlite], [TypeScript][nodets]
- npm: [workspaces][npmws]
- tsx: [docs][tsx]
- `server-only` npm package contents (inspected via `npm pack server-only`)
