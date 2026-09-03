# Fitsss design system

Clean, minimal, Apple-inspired. Think iOS system apps (Settings, Wallet, Fitness): quiet
surfaces, one accent, generous type, inset grouped lists, blurred bars, bottom sheets.
Mobile first; the desktop layout is the mobile layout centered at max 480px.

## Principles

1. **Content is the interface.** Colors and silhouettes of the user's clothes are the only
   decoration. Chrome stays neutral grey/white/black.
2. **One accent.** Interactive text and selected states use the tint. Primary buttons are ink
   (black in light mode, white in dark mode), never the tint.
3. **Few clicks.** Every primary flow completes within reach of the thumb. Sticky bottom actions.
4. **Native feel.** 44px tap targets, safe-area insets, press feedback, sheets instead of
   modals, large titles that collapse on scroll, `-apple-system` fonts.
5. **No AI slop.** No gradients, no glassmorphism cards, no emoji as icons, no purple.

## Tokens

Defined once in `src/app/globals.css` under `@theme` and consumed as Tailwind classes
(`bg-bg`, `text-label-2`, `bg-fill`, `text-tint`, `border-separator`, ...). Never hard-code hex in
components except when rendering a garment color.

| Token | Light | Dark | Tailwind |
|---|---|---|---|
| `--color-bg` | `#f2f2f7` | `#000000` | `bg-bg` (grouped background) |
| `--color-card` | `#ffffff` | `#1c1c1e` | `bg-card` |
| `--color-card-2` | `#f2f2f7` | `#2c2c2e` | `bg-card-2` (elevated / nested) |
| `--color-label` | `#000000` | `#ffffff` | `text-label` |
| `--color-label-2` | `rgb(60 60 67 / .6)` | `rgb(235 235 245 / .6)` | `text-label-2` |
| `--color-label-3` | `rgb(60 60 67 / .3)` | `rgb(235 235 245 / .3)` | `text-label-3` |
| `--color-separator` | `rgb(60 60 67 / .2)` | `rgb(84 84 88 / .6)` | `border-separator` |
| `--color-fill` | `rgb(120 120 128 / .12)` | `rgb(120 120 128 / .24)` | `bg-fill` (secondary buttons, chips) |
| `--color-fill-2` | `rgb(120 120 128 / .2)` | `rgb(120 120 128 / .32)` | `bg-fill-2` (pressed) |
| `--color-tint` | `#007aff` | `#0a84ff` | `text-tint` `bg-tint` |
| `--color-ink` | `#000000` | `#ffffff` | `bg-ink` (primary button) |
| `--color-ink-fg` | `#ffffff` | `#000000` | `text-ink-fg` |
| `--color-destructive` | `#ff3b30` | `#ff453a` | |
| `--color-success` | `#34c759` | `#30d158` | |

Dark mode follows `prefers-color-scheme` (the `.dark` class also works). Both palettes must be
defined; never let a color exist only in one mode.

## Typography

Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`.
No web fonts. Numerals use `tabular-nums` where they align in columns.

| Role | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| Large title | 34 / 41 | 700 | -0.4px | Page masthead, collapses on scroll |
| Title 1 | 28 / 34 | 700 | -0.3px | Sheet titles |
| Title 2 | 22 / 28 | 700 | -0.2px | Section titles |
| Title 3 | 20 / 25 | 600 | | Card titles |
| Headline | 17 / 22 | 600 | | Row titles, buttons |
| Body | 17 / 22 | 400 | | Default text |
| Callout | 16 / 21 | 400 | | Secondary text in cards |
| Subhead | 15 / 20 | 400 | | Row subtitles |
| Footnote | 13 / 18 | 400 | | Captions, section footers |
| Caption | 12 / 16 | 400 | | Swatch labels, badges |

Section headers above grouped lists: Footnote, uppercase, `text-label-2`, tracking 0.4px,
16px inset.

## Shape and depth

- Radius: cards and rows 12px, buttons 12px, chips and pills 999px, sheets 16px top corners,
  swatches circular, thumbnails 10px.
- No drop shadows on cards. Elevation is expressed by background level (`bg` → `card` → `card-2`).
  Sheets and popovers may use one soft shadow `0 -8px 32px rgb(0 0 0 / .12)`.
- Hairline separators, inset 16px from the left inside lists.

## Spacing

4px grid. Page horizontal padding 16px. Vertical rhythm between grouped sections 24px. Row min
height 44px, row padding 12px 16px. Bottom of every scrollable page reserves space for the
tab bar plus safe area (`pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+16px)]`).

## Core components (`src/components/ui` and `src/components/shell`)

- **LargeTitleHeader** — large title plus optional trailing action; collapses to a centered
  17px semibold inline title in a blurred bar once the large title scrolls out.
- **TabBar** — fixed bottom, 49px plus safe area, `backdrop-blur-xl bg-card/80`, hairline top
  border. Five tabs: Today, Closet, Looks, Styles, You. Icons lucide 24px stroke 1.75, label
  Caption 10px. Active tab uses tint.
- **InsetGroup / Row** — rounded 12px card containing rows with hairline separators; row has
  leading icon or swatch, title, optional subtitle, trailing value or chevron.
- **Sheet** — vaul drawer with grabber, `bg-card`, top radius 16px, content padding 16px,
  sticky footer for the primary action. Use for pickers, item detail, cart review.
- **Button** — `primary` (ink fill, 50px, Headline), `secondary` (fill, tint text),
  `plain` (tint text), `destructive`. Press: `active:scale-[0.98] active:opacity-90`,
  150ms ease-out.
- **Chip** — 34px pill, `bg-fill`, Subhead; selected: ink fill with ink-fg text.
- **SegmentedControl** — iOS style, `bg-fill` track, white/card sliding thumb.
- **Swatch** — 36px circle of the garment color; very light colors get a 1px separator ring;
  selected state adds a 2px tint ring with 2px gap and a check mark in contrasting color.
- **Silhouette** — tinted technical-flat drawing of a piece type
  (`src/components/silhouettes`), fill = garment hex, thin ink outline whose colour is picked
  from the garment's own lightness so white pieces read on white cards and black ones on dark.
- **EmptyState** — 44px lucide icon in `text-label-3`, Title 3, Callout body, one primary
  button.
- **Toast** — bottom, above tab bar, single line, auto dismiss 2.5s, one at a time.

## Motion

- State changes 150 to 200ms ease-out. Sheets use vaul's spring. Collapsing headers are
  scroll driven, not animated.
- Count-ups only for the cart badge. No page transition effects. Respect
  `prefers-reduced-motion`.

## Silhouettes

Most piece types render a **technical-flat garment drawing**: front view only, cropped to the
art plus 4% padding so every icon fills its box the same way, and drawn with three custom
properties the component supplies — `--icon-fill` (the garment's own colour), `--icon-fill-2`
(collars, cuffs, soles; a shade of the garment colour unless the piece has a real second colour)
and `--icon-stroke` (the outline). Strokes carry `vector-effect="non-scaling-stroke"`, so the
line weight stays constant from 26 to 168px.

The outline contrasts with the *garment*, not with the theme: `Silhouette` measures the piece
colour's lightness and inks it black at 62% or white at 72%. A colour it cannot measure (a
`var()` from the add flow) falls back to `var(--color-label)` at 70%.

The art lives in `src/components/silhouettes/art`, one SVG per drawing plus a generated
`index.ts` registry, and `mapping.ts` says which type (and variant) uses which drawing. Both are
produced by `scripts/import-icons.mjs` from the source illustrations — never hand-edit them.

The few types with no drawing (skirt, sandals, belt, sunglasses, watch, dress, jumpsuit) fall
back to the hand-drawn glyphs in `glyphs.ts`: one per `SilhouetteId` in `src/domain/types.ts`,
64×64 viewBox, front view, centered, filled with `currentColor`, 1.5px ink outline.
