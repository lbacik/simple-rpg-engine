# Research: i18n approach for the Next.js 16 App Router

Ticket: [#59](https://github.com/lbacik/simple-rpg-engine/issues/59) (child of map [#56](https://github.com/lbacik/simple-rpg-engine/issues/56)).
Date: 2026-10-12. Status: findings and a recommendation only. **No decision is made here**; the recommendation is input to a later decision ticket.

Vocabulary follows `CONTEXT.md`: Interface Language, Translation, Base Language, Scenario, Journal, Session. "Interface text catalogue" means all text that does not come from Scenario YAML (UI chrome, roll and Combat messages, Attribute and Range names, disabled-action reasons), as settled on the map.

Constraints already settled on the map, which this research takes as given: the Interface Language is `en` or `pl`; it lives in a **cookie**, defaulting from `Accept-Language`, then `en`; there is **no URL prefix** and no Session column.

## Versions checked

| Package | Version (npm, 2026-10-12) | Notes |
| --- | --- | --- |
| `next` | 16.4.0 (installed by `npm ci`) | Docs read from `node_modules/next/dist/docs/` at that version |
| `next-intl` / `use-intl` | 4.14.9 (published 2026-10-02) | Docs read from the repo source at commit `b9fc98a` |
| `intl-messageformat` | 12.1.3 | ICU parser and formatter from FormatJS |
| `@formatjs/intl-localematcher` | 0.9.0 | Used in the Next.js i18n guide |
| `negotiator` | 1.1.0 | Used in the Next.js i18n guide |
| `@lingui/core` | 6.9.1 | |
| `@inlang/paraglide-js` | 2.27.0 | |
| `next-international` | 1.3.1 (last release 2024-10-31) | Listed by the Next guide, but no release for two years |
| Node.js (local check) | 26.11.1, ICU 78.3, CLDR 48.0 | Production image is `node:24-bookworm-slim` (full ICU by default) |

## How the repo looks today

- Every page sets `export const dynamic = 'force-dynamic'` (`src/app/page.tsx`, `playthroughs/page.tsx`, `scenarios/[scenarioId]/page.tsx`, `play/[playthroughId]/page.tsx`, `play/[playthroughId]/journal/page.tsx`), and so does the asset Route Handler. Nothing is statically prerendered on purpose. `cacheComponents` is not enabled (`next.config.ts` sets only `output: 'standalone'`).
- `src/app/layout.tsx` hard-codes `<html lang="en">` and the English nav labels.
- Cookies are already read in Server Components and written only in Server Actions (`src/app/lib/session.ts`). The Server Actions finish with `revalidatePath` plus `redirect` so that they work without JavaScript (`src/app/lib/scenes.ts`, `inventory.ts`).
- Three Client Components exist (`start-form.tsx`, `result-panel.tsx`, `scene-illustration.tsx`). `result-panel.tsx` has an English "Continue" label.
- **English text is also produced outside `src/app`.** `src/engine/index.ts` builds Combat sentences such as `` `You attack ${weapon} (${combatRollText(roll)}): hit, ${roll.damage} Damage.` `` and `` `You use ${name}, restored ${restored} Health.` ``, and `src/app/lib/journal.ts` has the Journal entry labels. `src/engine` may not import `next/*`, `server-only`, `react` or `src/persistence` (architecture.md, repository shape). **Whatever holds the interface text catalogue must therefore be importable from a pure module, without Next.js or React.**

---

## 1. Library or hand-rolled typed dictionary

### What Next.js itself offers

- Next.js has no built-in i18n for the App Router. The i18n guide says localization "is not something specific to Next.js" and shows a hand-rolled dictionary: one JSON file per locale, loaded by a `server-only` `getDictionary(locale)` with dynamic `import()`, and a `hasLocale` type guard. [i18n guide, l.98-136][next-i18n]
- Bundle impact of that pattern: "Because all layouts and pages in the `app/` directory default to Server Components, we do not need to worry about the size of the translation files affecting our client-side JavaScript bundle size." [i18n guide, l.183][next-i18n]
- The rest of the guide assumes a `[lang]` route segment: Proxy redirects to `/<locale>/…`, and `next/root-params` exposes `lang` to server code. Root params "run in Server Components and server-side utilities, but not in Client Components, Server Actions, or Route Handlers." [i18n guide, l.37-96, l.185-252][next-i18n] **None of that applies here**, because the map rules out a URL prefix. Without a `[lang]` segment, the locale comes from `cookies()`/`headers()` (section 2).
- The guide lists libraries: `next-intl`, `next-international`, `next-i18n-router`, `paraglide-next`, `lingui`, `tolgee`, `next-intlayer`, `gt-next`. [i18n guide, l.289-299][next-i18n]

### next-intl (the most direct library candidate)

- **Setup without i18n routing**: four pieces. `messages/<locale>.json`; `src/i18n/request.ts` exporting `getRequestConfig(async () => ({ locale, messages }))`; the `createNextIntlPlugin()` wrapper in `next.config.ts`; and `NextIntlClientProvider` in the root layout if Client Components need messages. [app-router.mdx][ni-start]
- **Locale without URL prefixes**: "If your app doesn't require unique pathnames per locale, you can provide a locale to `next-intl` based on user preferences or other application logic. The simplest option is to use a cookie", with `(await cookies()).get('locale')?.value || 'en'` inside `getRequestConfig`. [app-router.mdx, "Provide a locale"][ni-start] `getRequestConfig` "is executed during the Server Components render pass, you can call functions like `cookies()` and `headers()`". [configuration.mdx, l.35][ni-config] The docs show no `Accept-Language` fallback in this mode. You write it yourself, with the same matcher as the hand-rolled option (section 4).
- **Server Components**: `useTranslations` works in non-async Server Components, and `await getTranslations(namespace)` works in async ones. "Your messages never leave the server … Library code for internationalization doesn't need to be loaded on the client side." [server-client-components.mdx, l.4-40][ni-rsc]
- **Client bundle**: `NextIntlClientProvider` passes **all** messages to the client by default. `messages={null}`, or picking namespaces, limits that. The recommended alternative is to pass translated labels as props to Client Components. [server-client-components.mdx, l.116-180, l.329-350][ni-rsc]
- **Server Actions**: `getTranslations({ namespace, locale })` works in actions. The docs warn that messages returned from an action stay in the old language after a switch unless the component is reset (`key={locale}`). [actions-metadata-route-handlers.mdx, "Server Actions"][ni-actions]
- **webpack**: the plugin registers both a Turbopack `resolveAlias` and a `webpack` alias for `next-intl/config` (`dist/cjs/development/plugin.cjs`, l.1441-1568 in 4.14.9). So `next build --webpack` is supported.
- **Typing**: message keys are typed by augmenting `AppConfig` with `Messages: typeof en`. Typing ICU *arguments* needs a generated `.d.json.ts`, which the plugin creates through `experimental.createMessagesDeclaration`, because TypeScript infers imported JSON values as plain `string`. [typescript.mdx, l.94-238][ni-ts]
- **Outside React**: `use-intl/core` exports `createTranslator({ locale, messages })` and `createFormatter`, which "can be used in any JavaScript environment". [core-library.mdx, l.68-107][ni-core] The `use-intl` package has a separate `./core` export, so a pure module (such as `src/engine`) could use it without importing React or Next.
- **Install footprint**: in a clean directory, `npm i next-intl@4.14.9` added 29 packages and about 15 MB, mostly `@swc/core` (9.5 MB) and `@parcel/watcher` (dependencies of the experimental message extractor). The runtime dependency chain is `use-intl` → `intl-messageformat` + `icu-minify` + `@formatjs/fast-memoize` + `@schummar/icu-type-parser`. (`npm view next-intl@4.14.9 dependencies`; local install.)
- **ICU**: next-intl uses ICU message syntax, including `plural`, `selectordinal` and `select`, and resolves plural categories with `Intl.PluralRules`. [translations.mdx, l.178-281][ni-tr] (See the Polish caveat in section 3.)

### Other maintained libraries (brief)

- **Lingui**: macro-based. With Next.js it needs `@lingui/swc-plugin`, whose README calls SWC plugin support "still experimental" with no semver compatibility across `swc_core` versions, so the plugin version has to be matched to the `swc_core` that Next ships. [lingui swc plugin compatibility][lingui-swc] For a two-language app this is extra build fragility and brings no benefit.
- **Paraglide JS**: a compiler that emits one tree-shakeable function per message. Its built-in locale strategies (`cookie`, `preferredLanguage` from `Accept-Language`, `baseLocale`) match the map's rule closely. [paraglide strategy][paraglide-strategy] However, per-request locale on the server needs an `AsyncLocalStorage` wrapper around each request ("be mindful of race conditions"), set up in middleware. [paraglide strategy][paraglide-strategy] That does not fit this repo's "no Proxy" Session design.
- **next-international**: last release 2024-10-31, two years before this research. Not considered maintained.

### Hand-rolled typed dictionary

The Next guide's pattern, adapted to having no `[lang]` segment and to a pure engine:

```ts
// a pure module: no next/*, no react
export const en = {
  nav: { scenarios: 'Scenarios', playthroughs: 'My Playthroughs' },
  combat: {
    attackHit: (weapon: string, roll: string, damage: number) =>
      `You attack ${weapon} (${roll}): hit, ${damage} Damage.`,
  },
  health: (n: number) => `${n} Health`,
} as const;

export type Catalogue = typeof en;          // or a hand-written interface
export const pl: Catalogue = { /* … */ };   // a missing key or a wrong signature is a compile error
export const catalogues = { en, pl } satisfies Record<InterfaceLanguage, Catalogue>;
```

- **Setup cost**: two catalogue files, a `pickLanguage` matcher (about 25 lines, section 4), a `plural` helper (about 10 lines, section 3), and `getInterfaceLanguage()` in `src/app/lib` that reads the cookie and headers. No `next.config.ts` change and no new dependency.
- **Type safety**: stronger than JSON-based catalogues by default. Keys, argument names and argument types are checked by `tsc` without code generation. With JSON + next-intl, argument typing needs the experimental declaration generator.
- **Server Components and Server Actions**: plain function calls, the same everywhere. The engine can take a `Catalogue` (or a translator function) as a parameter and so stay pure and deterministic.
- **Client bundle**: zero, as long as Client Components receive translated strings as props (the same practice next-intl recommends as its best-performing option). Both catalogues are tiny anyway.
- **What you give up**: ICU message strings, translator-friendly JSON, TMS/extraction tooling, and `t.rich` (rich text with React elements). Translators edit TypeScript. For a developer-maintained catalogue in two languages this is acceptable. For a larger team or more languages it would not be.

### Comparison

| | next-intl | Hand-rolled typed TS dictionary |
| --- | --- | --- |
| Works without a URL prefix | Yes, cookie read in `i18n/request.ts`; `Accept-Language` fallback hand-written | Yes, same resolver |
| Server Components / Server Actions | Yes (`useTranslations`, `getTranslations`) | Yes (plain calls) |
| Usable from `src/engine` (no Next/React) | Only through `use-intl/core` `createTranslator` | Yes |
| Client bundle | All messages by default; opt out with `messages={null}` or props | Nothing, if strings are passed as props |
| Typed keys | Yes (`AppConfig`) | Yes |
| Typed arguments | Experimental (`createMessagesDeclaration`) | Yes, native |
| Plurals | ICU `plural` | `Intl.PluralRules` + typed category record |
| `next build --webpack` | Supported (plugin adds a webpack alias) | Nothing to configure |
| New dependencies | 29 packages, about 15 MB installed | None |
| Translator workflow | JSON/PO, ICU, extraction tooling | Edit TS files |

---

## 2. Reading and setting the cookie in Next.js 16

### Reading

- `cookies()` and `headers()` from `next/headers` are **async**. `cookies()` can read in Server Components and read/write in Server Functions and Route Handlers. `headers()` is read-only. [cookies.md, l.6][next-cookies], [headers.md, l.6, l.34][next-headers]
- Both are Request-time APIs: "Using it in a layout or page will opt a route into dynamic rendering." [cookies.md, l.69][next-cookies], [headers.md, l.48][next-headers]
- With Cache Components, calling them outside `<Suspense>` "prevents the route from being prerendered". [cookies.md, l.70][next-cookies], [headers.md, l.49][next-headers] Cached functions "**cannot** access runtime APIs like `cookies()`, `headers()`", including through helpers, and on a dynamic route this can pass `next build` and fail under `next start`. "Read these values outside the cached scope and pass them as arguments." [use-cache.md, l.241][next-usecache] Today this matters only if `cacheComponents` is turned on later: the language would have to be an argument of any `use cache` function.
- The theme-cookie example in the Next docs states the trade-off directly: reading the cookie in the root layout "opts the entire app out of static prerendering". [preventing-flash-before-hydration.md, l.298][next-flash]

### Effect on static rendering and caching in this repo

- **Effectively none.** Every page is already `force-dynamic`, so reading the language in the root layout (for `<html lang>` and the nav) changes nothing for them. It only makes dynamic what is left of the static output, such as the built-in not-found page. The asset Route Handler does not render the layout and is unaffected.
- Dynamically rendered pages are served with `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. [self-hosting.md, l.99][next-selfhost] No shared cache stores a page in one language and serves it to another user, so no `Vary: Accept-Language` is needed.
- Client Router Cache: the `staleTimes.dynamic` default has been 0 seconds since v15 [staleTimes.md, l.42][next-stale], so other pages are fetched fresh after a switch.
- `export const dynamic` is still valid here because `cacheComponents` is off. It is removed when `cacheComponents` is enabled. [route-segment-config index, version history][next-segment]

### Setting (switching) via a Server Action

- Setting cookies "is not supported during Server Component rendering". Use a Server Function or a Route Handler. [cookies.md, l.74-83][next-cookies]
- "When you set or delete a cookie in a Server Action, Next.js re-renders the current page and its layouts on the server so the UI reflects the new cookie value." [mutating-data.md, l.508-512][next-mutating] Next 16 also has `refresh()` from `next/cache` to refresh the client router from a Server Action. [refresh.md, l.9-13][next-refresh]
- Forms bound to Server Actions in Server Components work without JavaScript. [mutating-data.md, l.132][next-mutating] To match the existing actions, the switcher can finish with `revalidatePath` + `redirect(returnTo)`. `returnTo` must be validated as a same-origin relative path (starts with `/`, not `//`).

Sketch:

```ts
'use server';
export async function setInterfaceLanguage(formData: FormData) {
  const value = formData.get('language');
  if (value !== 'en' && value !== 'pl') return;      // ignore anything else
  (await cookies()).set('lang', value, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 400 * 24 * 60 * 60,           // the Session cookie uses the same 400 days
  });
  // revalidatePath + redirect(safeReturnTo(formData)) for the no-JS path
}
```

### Where the default comes from

- **Resolve on every request and do not persist the default**: `cookie ?? pickLanguage(Accept-Language) ?? 'en'`. The cookie is written only when the player switches explicitly. This needs no Proxy and sends no `Set-Cookie` on GET, which fits architecture.md ("There is no Proxy"). A visitor who has never switched follows the browser's language.
- Persisting the negotiated default on the first visit would need Proxy, because Server Components cannot set cookies. That is extra machinery with no benefit here.
- Treat any cookie value outside `en`/`pl` as absent, because cookies are client-controlled.
- Notices are already rendered on the server from codes after a redirect, so they come out in the new language without the `key={locale}` reset that next-intl warns about for messages returned from actions. [next-intl, Server Actions][ni-actions]

---

## 3. Polish plurals and ICU

- CLDR cardinal rules for `pl` [CLDR plurals.xml][cldr-plurals]:
  - `one`: `i = 1 and v = 0` (1)
  - `few`: `v = 0 and i % 10 = 2..4 and i % 100 != 12..14` (2-4, 22-24, 32-34, …, 102)
  - `many`: `v = 0 and i != 1 and i % 10 = 0..1 or v = 0 and i % 10 = 5..9 or v = 0 and i % 100 = 12..14` (0, 5-21, 25-31, 112, …)
  - `other`: fractions only (`@decimal 0.0~1.5, …`)
- `Intl.PluralRules` implements these rules (ECMA-402; [MDN][mdn-pluralrules]). Checked locally (Node 26.11.1, CLDR 48):
  - `new Intl.PluralRules('pl').resolvedOptions().pluralCategories` gives `['one','few','many','other']`. English gives `['one','other']`.
  - `select()` gives `0→many, 1→one, 2/3/4→few, 5/11/12/14/21→many, 22→few, 25→many, 102→few, 112→many, 122→few, 1.5→other`.
  - Polish **ordinal** rules have only `other`.
- Example: Health "punkt": `one` "1 punkt", `few` "2 punkty", `many` "5 punktów", `other` "1,5 punktu". Health and Damage are integers in this engine, so `other` never appears for them, but a typed record should still require it, because `select()` can return it.
- **Hand-rolled plurals**: TypeScript's `lib.es2018.intl.d.ts` defines `Intl.LDMLPluralRule = 'zero'|'one'|'two'|'few'|'many'|'other'`, and `PluralRules.select()` returns it. A helper like `plural(lang, n, forms: Record<'one'|'few'|'many'|'other', string>)` (Polish) or `Record<'one'|'other', string>` (English) is type-checked per language and needs no ICU parser. Cache one `PluralRules` instance per language.
- **ICU** (MessageFormat syntax, `{n, plural, one {…} few {…} many {…} other {…}}`): available through next-intl/`use-intl` or standalone `intl-messageformat` (whose dependencies are `@formatjs/icu-messageformat-parser` and `@formatjs/fast-memoize`). ICU's advantages are translator familiarity and tooling. Its cost is untyped argument names in plain JSON, unless generated declarations are used.
- **Caveat in next-intl's docs**: the ordinal section lists Polish as using `few`/`many`. [translations.mdx, l.277-278][ni-tr] CLDR and `Intl.PluralRules` give Polish ordinals only `other`. Trust CLDR.
- **Not solved by either approach: grammatical case.** Polish inflects nouns, for example "Atakujesz *mieczem*" (instrumental) against the nominative "miecz". Sentences that combine catalogue text with Scenario-provided names (`You attack ${weapon}`, `You use ${name}`, `You escape from ${enemy}`) cannot be translated correctly by plurals or ICU `select` alone. They need either sentence shapes that keep the name in the nominative (for example "Atak: Miecz — trafienie, 3 obrażenia") or inflected forms supplied by the Translation. This is a design question for the catalogue and Translation-format tickets, not a library question.

---

## 4. Matching `pl-PL` to `pl`

- `Accept-Language = #( language-range [ weight ] )`, for example `da, en-gb;q=0.8, en;q=0.7`. `q=0` means "not acceptable", and a missing `q` means 1. The order of equal-weight ranges "cannot be relied upon" but is commonly used. RFC 9110 leaves the choice of matching scheme to the implementation. [RFC 9110 §12.5.4, §12.4.2][rfc9110]
- RFC 4647 §3.4 **Lookup** "progressively truncate[s]" a range from the end until it matches (`zh-Hant-CN` → `zh-Hant` → `zh`), then falls back to a default that the application defines. [RFC 4647 §3.4][rfc4647] For supported tags that are bare languages (`en`, `pl`), this is the same as comparing the primary language subtag.
- ECMA-402 uses exactly this algorithm internally (`LookupMatchingLocaleByPrefix`, §9.2.3, "the lookup algorithm defined in BCP 47 at RFC 4647 section 3.4"). [ECMA-402 §9.2.3][ecma402] However, **no standard JS API matches against an application's own list**. `supportedLocalesOf` matches against the engine's available locales. The `Intl.LocaleMatcher` proposal is at **Stage 1**. [proposal-intl-localematcher][tc39-matcher]
- Options:
  - **Hand-rolled** (verified locally): split the header on `,`; parse `q`; drop `q=0` and `*`; sort by `q` descending with a stable index tiebreak; for each range, `new Intl.Locale(tag).language` (canonicalises case, `PL-pl` → `pl`; throws `RangeError` on malformed tags such as `en_US`, so wrap it in try/catch and skip); return the first one in `['en','pl']`; otherwise `'en'`. Results: `pl-PL,pl;q=0.9,en-US;q=0.8` → `pl`; `de-DE,de;q=0.9` → `en`; `de-DE,pl;q=0.5` → `pl`; `en-GB,en;q=0.9,pl;q=0.8` → `en`; `pl;q=0,en;q=0.1` → `en`; `*` → `en`; `pl-Latn-PL-u-nu-latn` → `pl`; missing/empty → `en`.
  - **Library**: the Next i18n guide's `negotiator` + `@formatjs/intl-localematcher` `match(languages, locales, defaultLocale)`. [i18n guide, l.21-35][next-i18n] Locally, `match(['pl-PL'], ['en','pl'], 'en', {algorithm: 'lookup'})` → `pl`, and the same with `'best fit'`. These are two small dependencies (`negotiator` 24 kB, `intl-localematcher` 243 kB unpacked) for what is about 25 lines here.

---

## Recommendation (input to the decision ticket)

**A hand-rolled, typed TypeScript dictionary in a framework-free module, with Interface Language resolution in one server helper and switching through one Server Action.**

1. **Catalogue**: `en` and `pl` as TypeScript objects. `pl` is typed by the `en` shape, so a missing key or a wrong signature fails `tsc`. Messages with arguments are functions. Plurals use a small `Intl.PluralRules` helper with per-language typed category records (`one|few|many|other` for `pl`). It lives in a module without `next/*` or `react` imports, so `src/engine` can be passed a catalogue for the Combat and roll sentences it builds today. Where that module sits in the boundary table is for the decision ticket.
2. **Resolution**: `getInterfaceLanguage()` (server-only) returns `cookie ∈ {en,pl}` ?? the Lookup match of `Accept-Language` ?? `'en'`. It is called from the root layout (for `<html lang>` and the nav) and from pages and actions. The negotiated default is not persisted.
3. **Switching**: a `<form>` switcher that posts to a Server Action. The action validates the value, sets the cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`, 400 days), then `revalidatePath` + `redirect` to a validated `returnTo`. This works without JavaScript, as the existing actions do.
4. **Client Components** receive translated strings as props. No catalogue is shipped to the browser.

Why this fits:

- The pages are already all dynamic, so the cookie and header reads cost nothing in rendering or caching.
- The engine's English sentences need a catalogue that a pure module can use, which a Next-integrated library does not provide without dropping to `use-intl/core`.
- Two developer-maintained languages do not need ICU or TMS tooling, and native TypeScript typing of arguments is stronger than what JSON catalogues give without code generation.
- It adds no dependency, no `next.config.ts` plugin and no Proxy, and nothing that is sensitive to `next build --webpack` or the standalone output.

Trade-offs and risks:

- Translators edit TypeScript, not JSON/PO. There is no extraction tool, no translation-memory/TMS integration and no ICU syntax. If Interface Languages beyond `en`/`pl` or external translators appear, migrating to next-intl (or `use-intl/core` for the pure parts) means converting function messages into ICU strings. This is mechanical but touches every message.
- Rich text with React elements (`t.rich`) has to be done by hand, for example by composing JSX around plain strings.
- The `Accept-Language` matcher and the plural helper are our code and need unit tests. That is small, and section 4 lists the cases to cover.
- **Fallback alternative** if the decision ticket prefers a library: next-intl 4.x without i18n routing (cookie read in `i18n/request.ts`, with the same hand-written `Accept-Language` fallback), `NextIntlClientProvider messages={null}` or props for Client Components, and `use-intl/core` `createTranslator` inside the engine. Costs: about 29 extra packages, a `next.config.ts` plugin, and experimental generation for typed arguments.

## Questions for the decision and related tickets

- Where the catalogue module lives in the repository-shape table (for example a new `src/i18n` that `src/engine` may import), and whether the engine takes a catalogue or returns structured codes that `src/app` renders.
- How Combat and roll sentences that embed Scenario names deal with Polish grammatical case (section 3). This touches the Translation format (inflected names?) and the Journal, which "keeps narration as it was presented".
- Cookie name (`lang`?) and whether the switcher sits in the top nav on every page.
- Whether `<html lang>` follows the Interface Language while Scenario text keeps its own `lang` (Translation or Base Language) on its container, as `src/app/page.tsx` already does for the description.

## Sources

[next-i18n]: https://github.com/vercel/next.js/blob/v16.4.0/docs/01-app/02-guides/internationalization.mdx
[next-cookies]: https://github.com/vercel/next.js/blob/v16.4.0/docs/01-app/03-api-reference/04-functions/cookies.mdx
[next-headers]: https://github.com/vercel/next.js/blob/v16.4.0/docs/01-app/03-api-reference/04-functions/headers.mdx
[next-mutating]: https://github.com/vercel/next.js/blob/v16.4.0/docs/01-app/01-getting-started/07-mutating-data.mdx
[next-refresh]: https://github.com/vercel/next.js/blob/v16.4.0/docs/01-app/03-api-reference/04-functions/refresh.mdx
[next-usecache]: https://github.com/vercel/next.js/blob/v16.4.0/docs/01-app/03-api-reference/01-directives/use-cache.mdx
[next-flash]: https://github.com/vercel/next.js/blob/v16.4.0/docs/01-app/02-guides/preventing-flash-before-hydration.mdx
[next-selfhost]: https://github.com/vercel/next.js/blob/v16.4.0/docs/01-app/02-guides/self-hosting.mdx
[next-stale]: https://github.com/vercel/next.js/blob/v16.4.0/docs/01-app/03-api-reference/05-config/01-next-config-js/staleTimes.mdx
[next-segment]: https://github.com/vercel/next.js/blob/v16.4.0/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.mdx
[ni-start]: https://github.com/amannn/next-intl/blob/b9fc98a814957b9c97894c7b57151215ac39afa6/docs/src/pages/docs/getting-started/app-router.mdx
[ni-config]: https://github.com/amannn/next-intl/blob/b9fc98a814957b9c97894c7b57151215ac39afa6/docs/src/pages/docs/usage/configuration.mdx
[ni-rsc]: https://github.com/amannn/next-intl/blob/b9fc98a814957b9c97894c7b57151215ac39afa6/docs/src/pages/docs/environments/server-client-components.mdx
[ni-actions]: https://github.com/amannn/next-intl/blob/b9fc98a814957b9c97894c7b57151215ac39afa6/docs/src/pages/docs/environments/actions-metadata-route-handlers.mdx
[ni-ts]: https://github.com/amannn/next-intl/blob/b9fc98a814957b9c97894c7b57151215ac39afa6/docs/src/pages/docs/workflows/typescript.mdx
[ni-core]: https://github.com/amannn/next-intl/blob/b9fc98a814957b9c97894c7b57151215ac39afa6/docs/src/pages/docs/environments/core-library.mdx
[ni-tr]: https://github.com/amannn/next-intl/blob/b9fc98a814957b9c97894c7b57151215ac39afa6/docs/src/pages/docs/usage/translations.mdx
[lingui-swc]: https://github.com/lingui/swc-plugin/blob/main/packages/lingui-macro/README.md#compatibility
[paraglide-strategy]: https://paraglidejs.com/strategy
[cldr-plurals]: https://github.com/unicode-org/cldr/blob/main/common/supplemental/plurals.xml
[mdn-pluralrules]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules
[rfc9110]: https://www.rfc-editor.org/rfc/rfc9110#section-12.5.4
[rfc4647]: https://www.rfc-editor.org/rfc/rfc4647#section-3.4
[ecma402]: https://tc39.es/ecma402/#sec-lookupmatchinglocalebyprefix
[tc39-matcher]: https://github.com/tc39/proposal-intl-localematcher

- Next.js 16.4.0 docs, read from the bundled copy in `node_modules/next/dist/docs/` (line numbers refer to that copy; links go to the same files at tag `v16.4.0`): [internationalization][next-i18n], [cookies][next-cookies], [headers][next-headers], [mutating data][next-mutating], [refresh][next-refresh], [use cache][next-usecache], [preventing flash before hydration][next-flash], [self-hosting][next-selfhost], [staleTimes][next-stale], [route segment config][next-segment]
- next-intl docs at commit `b9fc98a`: [App Router setup][ni-start], [configuration][ni-config], [Server & Client Components][ni-rsc], [Server Actions][ni-actions], [TypeScript][ni-ts], [core library][ni-core], [translations/ICU][ni-tr]; `next-intl@4.14.9` package source (`dist/cjs/development/plugin.cjs`) and `npm view` metadata
- Lingui: [SWC plugin compatibility][lingui-swc]. Paraglide JS: [strategy][paraglide-strategy]
- Unicode CLDR: [plurals.xml][cldr-plurals]. MDN: [Intl.PluralRules][mdn-pluralrules]
- IETF: [RFC 9110 §12.5.4 Accept-Language, §12.4.2 quality values][rfc9110], [RFC 4647 §3.4 Lookup][rfc4647]
- ECMA-402: [§9.2.3 LookupMatchingLocaleByPrefix][ecma402]. TC39: [Intl.LocaleMatcher proposal (Stage 1)][tc39-matcher]
- Local verification: `Intl.PluralRules`/`Intl.Locale` behaviour and the `Accept-Language` matcher run under Node 26.11.1 (ICU 78.3, CLDR 48.0); `@formatjs/intl-localematcher@0.9.0` `match()` compared against it
