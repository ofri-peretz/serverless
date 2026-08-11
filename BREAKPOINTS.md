# Breakpoint contract

> **Doctrine lives in Interlace.** The design system's breakpoint ladder and
> the reasoning behind it are authored at
> [`docs/philosophies/BREAKPOINT_PHILOSOPHY.md`](https://github.com/ofri-peretz/interlace/blob/main/docs/philosophies/BREAKPOINT_PHILOSOPHY.md).
> What follows is only the **local enforcement contract** for this repo's apps.
>
> ⚠️ **This repo's ladder and the design system's disagree.** The apps here use
> Tailwind v4 defaults (`sm:` 640px, `2xl:` 1536px) and their lock test fails if
> `--breakpoint-*` overrides exist. `@interlace/ui` narrowed to four rem tiers
> (`sm:` **480px**, no `2xl:`) and *its* lock fails if they don't. Neither is
> broken — they govern different surfaces — but a component pulled from
> `@interlace/ui` into an app here hits `sm:` at 640px, not the 480px its
> `MIN_VIEWPORT` contract assumes. **Adopting the DS ladder here is an open
> decision, not an oversight; don't relax either lock to make the other pass.**
>
> This file used to declare itself "source-of-truth across
> `ofriperetz.dev/{eslint, agents, serverless}`" with identical hand-copied
> copies in each — the drift it existed to prevent was the drift it caused.

## The five breakpoints (Tailwind v4 defaults — do not override)

| Token  | min-width      | Use                                                                         |
| ------ | -------------- | --------------------------------------------------------------------------- |
| `sm:`  | 40rem / 640px  | Phablet → small tablet portrait. Default for "stop being one-column."       |
| `md:`  | 48rem / 768px  | Tablet portrait. Default for two-column layouts and showing horizontal nav. |
| `lg:`  | 64rem / 1024px | Tablet landscape / small laptop. Default for three-column grids.            |
| `xl:`  | 80rem / 1280px | Desktop. Reserved for content that genuinely benefits from a wider canvas.  |
| `2xl:` | 96rem / 1536px | Large desktop. Rare. Hero / marquee / decorative scaling only.              |

These are Tailwind v4's built-in defaults. We use them as-is — no
`@theme` overrides, no `--breakpoint-*` custom variables, no
`min-[Xpx]:` or `max-[Xpx]:` arbitrary variants. **A breakpoint that
doesn't appear in the table above does not exist** in our apps.

## Why no custom breakpoints

Every custom breakpoint is a contract the next person (or the next
agent) doesn't know about. A site of four apps with synchronised
breakpoints stays predictable; one app with a custom `2.5xl:` at 1440px
breaks the muscle memory of everyone editing the others, and the screen
size where the bug appears stops mapping to the design tokens used at
review time. The cost of "I'll just add one more" compounds — six
months in, no one remembers which app uses which set, and the marketing
landing, the docs site, and the blog start rendering differently at the
laptop sizes our users actually have.

If a layout looks wrong at exactly 920px, the answer is **not** to
introduce a custom breakpoint between `sm` (640) and `md` (768) and
`lg` (1024). The answer is to redesign the layout so it works through
that range with one of the three.

## Forbidden patterns (lint-locked where the app has vitest)

- `@theme inline { --breakpoint-* : ... }` in any `*.css` file under `src/`.
- `screens: { … }` in any legacy `tailwind.config.*` file.
- `className="… min-[920px]:flex …"` — any `min-[…px]:` / `max-[…px]:`
  arbitrary breakpoint variant in source. (Container queries `@…` are
  fine; this rule is only about viewport breakpoints.)
- `"tailwindcss": "^4"` (unpinned) in any app `package.json` — pin to
  `^4.1.18` or higher so a future minor that bumps the default scale
  can't drift a single app silently.

## Where the lock lives

| Surface                         | Lock                                                      |
| ------------------------------- | --------------------------------------------------------- |
| `eslint/apps/docs`              | `src/__tests__/breakpoints-lock.test.ts`                  |
| `agents/apps/interlace-landing` | `src/__tests__/breakpoints-lock.test.ts`                  |
| `agents/apps/blog`              | No vitest in this app yet — doc-only. PR review enforces. |
| `serverless/apps/docs`          | `src/__tests__/breakpoints-lock.test.ts`                  |

Each lock asserts:

1. No `--breakpoint-` overrides in any `.css` under `src/`.
2. No `min-[Xpx]:` / `max-[Xpx]:` viewport arbitraries in source
   (`.ts` / `.tsx` / `.css`).
3. The app's own `package.json` pins `tailwindcss` to `^4.1.18` or higher.

A failure means either the violation is a real bug (revert) or the
contract has changed (edit this doc in **all three repos** and update
every lock test, then come back).

## When to widen or narrow the table

Never per-app **within the three consumer repos** (`eslint`, `agents`,
`serverless`). Across those, the table is a synchronised contract: if a
real product need surfaces — e.g. a 1920px breakpoint for an enterprise
dashboard — propose it in a PR that touches all three in the same diff.
Any single-repo bump is a leak; review will block it.

`@interlace/ui` is **not** one of the three. The design system is a
separate surface with its own deliberately narrower ladder and its own
lock (see the warning at the top of this file). A difference between this
table and the DS ladder is the known open decision, not a leak —
reconciling them means adopting the DS ladder here on purpose, in its own
change.

## Mobile-first reminder

We write mobile-first. Default styles target ≤ 640px. `sm:` / `md:` /
`lg:` only _add_ behaviour at larger viewports. Never use a desktop
default and then override with `max-[…]` to "fix" mobile — flip the
authoring direction. The CLAUDE.md instructions for the `eslint` repo
already require reproducing layout regressions at ~390px before claiming
a fix; that practice applies in all three.
