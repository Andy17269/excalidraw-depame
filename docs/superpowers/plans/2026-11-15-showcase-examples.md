# Three showcase examples Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. User authorized direct implementation and delegated design details.

**Goal:** Ship three application-integrated, repeatable sketch-to-UI examples: music, travel discovery, commerce operations.

**Architecture:** A small catalog owns entry labels and explicit per-instance scene metadata. Tagged sketches resolve to local editable scenes through the existing animation/undo flow; ordinary sketches keep the real vision backend. New sketch and result layouts share dimensions and region placements. Existing dirty workspace is preserved; no blanket commits or resets.

**Tech Stack:** TypeScript, React, Excalidraw native elements, bundled PNG assets, acdert.

**Spec:** User request and approved themes in this chat; design details below.

## Design and constraints
- Music retains its current 390×844 structure; fixed showcase selects stable cover styles.
- Travel: 390×844 mobile discovery page, warm white #fafaf7, forest #214d43, ink #203b35, muted #64746c, border #dce5df. Search, category chips, large destination photograph, weekend route cards, bottom navigation. Existing local travel/photo assets; no remote dependency.
- Commerce: 1120×740 desktop operations page, navy sidebar #203549, blue #3869db, slate ink #243449, white cards on #f4f6fa. Four metrics, weekly revenue trend, channel comparison, recent orders. All numbers and plotted values consistent; small sample-data label.
- All major cards, frames, labels and charts remain editable. Excalifont/Xiaolai follows existing canvas identity. No whole-screen screenshot replacement.
- Each inserted example carries a unique instance marker. Only explicitly marked full examples use local results; selecting ordinary content never matches by keyword. Replacements remove only the matched instance and retain other canvas elements. Size/position tracks the frame.
- Examples are accessible in the existing presets menu; startup's three cards become the three showcase sketches. Existing diagram shortcuts remain available.
- Reuse current generation animation, cancellation, single-step undo, notification and local asset loading patterns. Do not add system APIs.

## Review Focus
- Ordinary prompts mentioning music/travel/commerce must not silently receive fixed results.
- Two copies of a demo or mixed examples must not overwrite one another.
- Moving/resizing a sketch must place the result within its frame.
- Async insertion/generation must not mutate a different document after switching.
- Narrow windows, long preset menus, local asset failures and undo must remain usable.

## Tasks
1. [x] Add catalog and pure instance resolver. Write behavior tests first for untagged, partial, moved, deleted and multiple examples; run Node tests.
2. [x] Build editable travel and commerce layouts plus corresponding sketches. Add local scene assembly and safe insertion; route marked examples through existing vision animation. Fix music showcase covers deterministically. Validate types and unit tests.
3. [x] Connect three examples to preset menu/startup and expose meaningful labels. Update DESIGN.md and demo documentation. Reuse current component and theme owners.
4. [x] Run build, lint, suite and isolated native showcase regression. Capture/inspect sketch and result for each example; verify editable elements, scoped replacement, repeatability, undo, narrow menu and dark theme. Review final diff limited to this task.


## Verification evidence
- `npm run build`: passed; existing large-chunk and mixed import warnings remain.
- `npm run lint`: passed.
- `npm test`: 88 tests passed.
- `node tests/native-showcase.mjs`: three local results, editable content, surrounding-content preservation, undo, same-document abort restore, offline generation and narrow dark menu passed; zero console errors.
- `node tests/native-demo-mode.mjs`: defaults, persistence, visibility passed.
- `node tests/native-ui-polish.mjs`: startup focus, new showcase insertion, diagram pending feedback, light/dark/narrow, settings keyboard and reduced motion passed.
- Premium strict audit: zero findings (`.debug/showcase/premium-audit.json`).
- Reviewer findings addressed: copied frame/part metadata cannot remove originals/copies; abort restores only within current document revision; offline permits local scenes and forbids remote vision calls.
- Native screenshots inspected and saved in `docs/previews/showcase/`.
- `node tests/native-vision-ui.mjs`: selected-region generation, automatic corner badge, preserved outside marker, undo and zero runtime errors passed. Test now uses a fixed 1280×800 viewport and skips onboarding, avoiding environment-dependent selection coordinates.

### Latest shared-workspace rerun
The first full run passed 88/88. A subsequent rerun after `src/services/uiAssets.ts` changed independently during this task found 86/88: `UI asset catalog contains 25 existing files across 5 categories` now sees 45; `queryUiAssets filters by category and keywords` expects 5 hero assets but sees 9. This task did not edit that catalog. Showcase/native tests and lint remain passing. Those unrelated fixed-count assertions were left for the catalog change owner.
