<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Fitsss

Personal wardrobe app. The closet is made of abstract *blocks* (piece type + color, fit,
material, pattern, weight), not photos. Outfits are generated from those blocks. Mobile first.
Single user for now. See `DESIGN.md` for the visual system, `src/domain` for the model.

## Commands

```bash
pnpm dev            # next dev (Turbopack) on http://localhost:3100
pnpm build          # production build, must pass before handing work back
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest run
pnpm db:generate    # drizzle-kit generate (after editing src/db/schema.ts)
pnpm db:migrate     # apply migrations to DATABASE_URL
pnpm db:studio      # drizzle studio
```

Local Postgres runs via Homebrew on `localhost:5432`, database `fitsss`. Env lives in
`.env.local` (see `.env.example`).

## Layout

```
src/app/(app)/…          authenticated app routes (today, closet, looks, styles, you)
src/app/(auth)/…         login, register
src/domain/              pure TS model: types, catalog, colors, materials, derive, validate. No framework imports.
src/db/                  drizzle schema, client, migrations
src/server/              server actions and queries ("use server"); the only place that touches the db
src/lib/                 auth client/server helpers, utils
src/components/ui/       shadcn primitives (generated, restyled to DESIGN.md)
src/components/shell/    app chrome: TabBar, LargeTitleHeader, Sheet, EmptyState, Toast
src/components/silhouettes/  one SVG glyph per SilhouetteId
src/components/closet/   closet features (grid, item sheet, add flow under closet/add/)
```

## Rules

- **Domain first.** Every attribute vocabulary lives in `src/domain`. Never hard-code a fit,
  material, pattern or color list in a component; read it from the catalog. Never add free-form
  string attributes to blocks.
- **Derived fields are computed on the server** with `derive()` at write time and stored
  denormalized. Clients never compute warmth/formality themselves.
- **Validation at the boundary.** Server actions call `validateBlockInput` on anything that came
  from the client. Return `{ ok, errors }` shaped results; do not throw for user errors.
- **Server actions over route handlers** for mutations. Queries are plain async functions in
  `src/server` called from server components. Client components receive data as props.
- **Tokens only.** Colors and type come from `globals.css` tokens per `DESIGN.md`. The only raw
  hex in JSX is a garment's own color.
- **Mobile first.** Build and test at 390×844 first. Everything reachable by thumb; primary
  actions sticky at the bottom; respect safe-area insets.
- **No new dependencies without need.** Current set: next, react, tailwind v4, shadcn (radix),
  vaul, lucide-react, drizzle-orm, postgres, better-auth, zod, vitest.
- **Tests.** Domain logic has vitest unit tests next to the source (`*.test.ts`). UI is
  verified by running the app.
- **Definition of done** for any work package: `pnpm typecheck && pnpm lint && pnpm test &&
  pnpm build` all pass, and the flow was exercised in a browser at mobile width.
