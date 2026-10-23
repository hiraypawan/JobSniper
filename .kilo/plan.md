# UI Redesign Plan — Pastel Professional Cartoonish (Not Slop)

## Problem
Current UI feels generic/AI-slop: harsh lime/emerald accents, dark slate background, sharp borders, basic card shadows, flat typography. No personality, no warmth.

## Design Direction
- **Palette**: Soft pastel cream backgrounds (#FFF8F0, #FDF6F0), pastel peach (#FFE4D6), pastel mint (#E0F5E9), pastel lavender (#E6E6FA), pastel butter (#FFF5CC). No neon lime.
- **Typography**: Rounded sans-serif family (`Quicksand`, `Nunito`, or `Outfit` via Google Fonts) — friendly curves without being childish.
- **Shape Language**: Very rounded corners (3xl/4xl), pill-shaped badges, soft blob-shaped decorative accents behind cards (low opacity).
- **Cartoonish-but-Professional**: Subtle hand-drawn feel via rounded borders + soft drop shadows (`shadow-[0_12px_40px_-12px_rgba(255,200,150,0.25)]`), gentle gradient overlays, no sharp edges, no harsh contrast. Keeps data density and professional layout.
- **Eye Comfort**: Warm cream instead of pure white/slate, low-contrast muted text (`#5C4A42` warm dark), generous whitespace, larger touch targets, reduced animation intensity.
- **Components to Redesign**:
  1. `globals.css` — new pastel theme variables, new font import, new shadow/color utility classes.
  2. `tailwind.config.ts` — extend colors with pastel palette, add rounded font.
  3. `layout.tsx` — inject Google Fonts (`Quicksand` / `Outfit`), set base warm color.
  4. `page.tsx` — replace harsh emerald/slate with pastel accents, rounder cards, softer shadows, warm text.
  5. Components (`HeaderBar`, `CompanyCard`, `FilterBar`, `KpiStrip`) — apply pastel styles consistently.
  6. Remove harsh lime-200 selection, replace with peach/mint selection.

## Execution Steps
1. Write `.kilo/plan.md` (this file) and confirm.
2. Update `tailwind.config.ts` with pastel colors.
3. Update `app/globals.css` with new theme variables and font.
4. Update `app/layout.tsx` with font import and warm base.
5. Update `app/page.tsx` with pastel styling.
6. Update key components (`HeaderBar`, `CompanyCard`, `FilterBar`, `KpiStrip`).
7. Verify build runs (`npm run typecheck` / `npm run build`).
