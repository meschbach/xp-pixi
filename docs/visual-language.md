# Visual Language

A reference for how the game uses color and other visual channels, so future work does not re-litigate palette
collisions or introduce color-blind-inaccessible designs. First consumer: the `tower-target-visuals` change.

## Principle

**Voice is not a load-bearing channel.** The existing palette already spans the hue wheel (see below), so no accent set
can stay distinguishable from it under every color-vision type. Identity and state that must be readable by everyone are
therefore encoded redundantly across several structurally independent channels:

- **Pattern** (line dash style) — the tether is drawn with a distinct dash per identity.
- **Glyph** (marker shape) — the enemy marker carries a matching distinct shape.
- **Geometry** (position) — converging links fan out to distinct positions around a shared target, so separation reads
  by location alone.
- **Motion** (animation) — a slow, dim de-phased pulse travels along each tether, so links also read by time.
- **Luminance** (brightness) — accents differ in brightness when hue collapses.
- **Hue/color is an enhancement**, never the sole separator, for anything a player must tell apart to play.
- There is **no color-blind "mode"** — redundant coding works for all vision types simultaneously, so no preference or
  settings surface ever needs to exist.

## Reserved color table

| Role | Value(s) | Where |
|------|----------|-------|
| Enemy bodies (index by data order) | `0xff8787` `0xffd43b` `0x74c0fc` `0xb197fc` `0x63e6be` | `sceneView.ts` `ENEMY_PALETTE` |
| Enemy fallback | `0xadb5bd` | `sceneView.ts` `DEFAULT_ENEMY_COLOR` |
| HP bar: full / mid / low | `0x51cf66` / `0xffa94d` / `0xff6b6b` | `sceneView.ts` `COLOR_HP_*` |
| HP bar background | `0x16161d` | `sceneView.ts` `COLOR_HP_BAR_BG` |
| Coverage tint / focus | `0x74c0fc` | `boardView.ts` / `sceneView.ts` `COLOR_COVERAGE*` |
| Tower body / stroke | `0xf59f00` / `0xffd43b` | `sceneView.ts` `COLOR_TOWER*` |
| Hover | `0xffffff` | `sceneView.ts` `COLOR_HOVER` |
| Selected | `0xffd43b` | `sceneView.ts` `COLOR_SELECTED` |
| Preview valid / invalid | `0x8ce99a` / `0xff6b6b` | `sceneView.ts` `COLOR_PREVIEW_*` |
| Board: buildable / rock / spawn / goal / tower base | `0x274036` `0x3d3d46` `0xa63a3a` `0x2f5da6` etc. | `boardView.ts` |
| Float/reject text | `0xff8787` | `inputController.ts` / `selectionHandlers.ts` `FLOAT_COLOR_REJECT` |
| Entity outline | `0x101018` | `sceneView.ts` |

New colors referenced in a feature should be added to this table.

## Tower-target identity (from `tower-target-visuals`)

Each placed tower carries a persistent identity **book** — color + tether dash pattern + enemy marker glyph, all keyed
by the tower's (unified) id so they never drift out of phase, plus two spatial/temporal channels derived from the id:

| Channel | Variants |
|---------|----------|
| Accent hue | cyan `0x22d3ee`, magenta `0xcc55ff`, rose `0xee2d8a`, spring green `0xb8e986`, teal `0x0d9aa3` |
| Tether pattern | solid, long-dash, short-dash, dash-dot, dotted |
| Marker glyph | ring, dot, diamond, square, triangle |
| Geometry (fan-out) | enemy marker offset by id: N=1 centered, N=2 left/right, N=3 triangle, N=4 square |
| Motion (pulse) | slow dim traveling dash per tether, phase offset by id |
| Luminance | accent set keeps a spread so hues also differ by brightness when hue collapses |

The pattern + glyph + geometry + pulse are the guaranteed decoders; hues are best-effort enhancement (see Principle).

The accent palette was chosen and is verified by the checked-in tool `npm run cvd-check` (Machado 2009 matrices, CIE
Lab distance) against the full reserved table **including the enemy-fallback gray `0xadb5bd`**. It was derived in two
passes: originals that vanished under red-green deficiency were replaced (lime `0xb3e633` ΔE≈4.9 from enemy yellow →
spring green `0xb8e986`; periwinkle `0x88aaff` ΔE≈1.3 from enemy periwinkle → teal), then rose `0xff55aa` and the first
teal were deepened to clear the fallback gray. The purple family is unavailable (magenta owns it) and yellow is taken by
the enemy palette, so the replacements occupy the open cool-green and deep-rose sectors, differentiated by luminance +
pattern + glyph.

Known residual soft spots (accepted, carried by pattern/glyph/luminance; `npm run cvd-check` flags them):
- cyan `0x22d3ee` vs enemy teal `0x63e6be` (ΔE 6.5) — the single unavoidable corner; cyan is the canonical accent blue;
- spring green `0xb8e986` vs hp-full green `0x51cf66` (ΔE 11.0) — right at threshold, but the HP bar is not where a
  target marker lands.

## Color-vision-deficiency gate

Any new color (or any change to a reserved color) that plays a role a player must read at scale SHALL be verified with a
CVD simulation in CIE Lab distance. The checked-in tool `npm run cvd-check` does this automatically: it transforms each
accent through the Machado-2009 anopia matrices (deuteranopia / protanopia / tritanopia), measures CIE Lab distance to
every reserved color, and flags anything below the threshold. Run it after any palette change, and use
`npm run cvd-check -- '#rrggbb'` to vet a single candidate color.

The gate's rule of thumb: treat ΔE < ~12 at game scale as an ambiguity risk. Two known rules from the
`tower-target-visuals` analysis:

- Pairs with ΔE ≈ 1–6 under red-green CVD are effectively invisible (e.g. original accent periwinkle `0x88aaff` vs
  enemy `0xb197fc`; lime `0xb3e633` vs enemy yellow `0xffd43b`).
- Because the reserved palette fills the hue wheel, a color that is "far from everything" rarely exists — rely on
  pattern/glyph/luminance for legibility and let hue be the aesthetic.
- Hue families can be structurally unavailable: the purple/violet family is owned by the magenta accent, and the yellow
  family is owned by the enemy palette — a new accent attempting either region must instead separate by luminance +
  pattern + glyph, or find a genuinely open sector.
- The reserved set must include **every** readable game color, not just enemy bodies — the enemy-fallback gray `0xadb5bd`
  nearly hid two collisions when it was momentarily left out.

## Selecting an accent set (reproducible)

To pick or re-derive accent colors: hold the reserved table fixed, then solve for a set that maximizes the minimum CIE
Lab ΔE across all three CVD types against (a) every reserved color and (b) every other accent, while (c) keeping a
luminance spread so hues also separate by brightness. Require a target floor of ΔE ≥ ~12 for intra-accent and enforce it
per-hue-family. Note that a naive "maximize minimum ΔE" optimizer will overfit to pure saturated primaries or
near-black hues (bad design); constrain to mid-luminance, saturated, aesthetically reasonable colors and sanity-check by
eye. The `tower-target-visuals` palette was derived this way.

## Reference tooling

- **`scripts/cvd-check.mjs`** (npm script `cvd-check`) — runnable Machado-2009 simulation over the reserved + accent
  sets. To keep it drift-free, keep its `RESERVED` and `ACCENTS` tables in lock-step with the table above and the
  `design.md` palette.
