# Brand assets

Master brand / identity source for Shot O'Clock — the marks, wordmarks, lockups,
and splash concept. This is **design source**, kept separate from the flat,
Expo-consumed runtime exports in `../images/` (which `app.json` references by name).

## Conventions

- **Filenames:** `shot-oclock-<role>[-<variant>].<ext>`, kebab-case.
- **Master = SVG.** Each asset's `.svg` is the source of truth; PNGs are exports.
  (`glass/` is the exception — no vector master yet; its PNGs are the de-facto
  master until one is drawn.)
- **Variant suffixes:**
  | Suffix | Meaning |
  |---|---|
  | `-on-brand` | baked onto the brand-purple background |
  | `-on-dark` | baked onto a dark-navy background |
  | `-on-light` | baked onto a white background |
  | `-transparent-navy` | alpha background, navy-ink artwork (use on light surfaces) |
  | `-transparent-white` | alpha background, white-knockout artwork (use on dark surfaces) |
  | `-transparent` | alpha background (single-color asset, no light/dark split) |

## What's here

| Folder | Asset | Status |
|---|---|---|
| `logo/` | **Primary mark** — clock dial + V-hands + liquid "smile" | **Ships.** Full set: on-brand, on-dark, on-light, transparent-navy, transparent-white, + SVG master |
| `glass/` | **Glass-in-Dial** — shot glass inside a dial | Alternate-icon option. transparent + on-light. **No SVG master yet** |
| `meniscus/` | **Meniscus** — squircle icon, liquid meniscus + hands | Alternate-icon option. transparent + on-light + SVG master |
| `horizontal-wordmark/` | **Horizontal wordmark** "Shot O'Clock" | Wordmark candidate. transparent + SVG master |
| `stacked-wordmark/` | **Stacked wordmark** | Wordmark candidate. SVG master only (no PNG exports yet) |
| `icon-O/` | **Icon-O treatments** — the dial replaces the "O" in O'Clock | Wordmark candidates. horizontal + stacked, each PNG + SVG |
| `lockups/` | **Icon + wordmark lockups** | Candidates. `shot-oclock-lockup-icon-left-transparent.png` (icon-left) |
| `splash/` | **Splash concept** | SVG concept is the keeper |
| `explorations/` | Quarantined explorations / AI-gen dupes | Not deleted — set aside; see below |

### Identity status (as of Phase 17)

- **Mark is locked:** the primary mark **ships**; **Glass-in-Dial** and **Meniscus**
  are deferred **alternate-icon-picker** options.
- **Wordmark / lockup configuration is NOT decided** — horizontal wordmark, stacked
  wordmark, the icon-O treatments, and icon-left / icon-above lockups are all live
  candidates, to be resolved later by mocking them into real screens for comparison.
- **Lockups** can come from a pre-combined asset (e.g. the icon-left lockup here) or
  be hand-assembled from the mark master + a wordmark master for finer control over
  positioning/sizing. Both paths are valid; the choice is made per placement.

## `explorations/`

Set-aside material — **nothing is deleted**, only moved here. Contents: `stacked-extra/`
(scratch), the busy "stopwatch + splash + cups" splash rasters (a discarded direction;
the splash SVG concept is the keeper), near-duplicate AI renders of the glass/meniscus
marks, and `Wordmark2` (a near-dup of the horizontal wordmark). The specific glass and
meniscus renders promoted as keepers were a judgement call among near-identical AI
exports — swapping in a different render is just a move, since all of them are still here.

## Feeding the app

`app.json` and `../images/` are **untouched**. When the identity is wired in, the final
runtime exports go to `../images/` under the names Expo expects, or an SVG is imported
into a component via `react-native-svg`. SVG-vs-PNG per placement is decided once the
asset is visibly rendered in its real spot, not in the abstract.
