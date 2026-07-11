# Resource Manager browser tabs

## Problem

Orca stores browser workspaces by owner in `browserTabsByWorktree`, but the Resource Manager only merges memory snapshots and daemon terminal sessions (`src/renderer/src/components/status-bar/ResourceUsageStatusSegment.tsx:673-835`, `src/renderer/src/components/status-bar/mergeSnapshotAndSessions.ts:133-316`). A workspace that only owns browser tabs is therefore absent, and an existing workspace row exposes only its terminal sessions (`ResourceUsageStatusSegment.tsx:358-637`). The status-bar trigger and accessible copy also report terminal sessions only (`ResourceUsageStatusSegment.tsx:1167-1234`, `resource-manager-terminal-copy.ts:1-46`).

Issue #5095 reports that users cannot find which workspace owns a RAM-heavy browser. PR #8116 put counts on every sidebar card; this design intentionally does not modify the sidebar.

## Root cause

Browser ownership is available in renderer state, but it never enters the Resource Manager view model. The Resource Manager has no browser row, browser navigation action, browser close action, or browser count in its trigger.

## Non-goals

- No sidebar indicator or reuse of PR #8116.
- No per-browser CPU or memory number; current snapshots do not attribute Electron webview usage to browser workspaces honestly.
- No new polling, IPC, persistence, telemetry event, or provider-specific browser inventory.
- No management or counting of floating-workspace or folder-workspace browser slots; the existing Resource Manager tree is repo/worktree-scoped.
- No bulk “close all browsers” action.
- No cross-window/global browser inventory. The renderer store is the authority for the current Orca window; remote-host mutations converge through the existing runtime snapshot subscription.

## Design

1. Extend the renderer-local view model with `UnifiedBrowserRow`. Open-only selectors must read both `browserTabsByWorktree` and `unifiedTabsByWorktree`: browser workspaces own local page state and cleanup, while unified browser tabs own the rendered group and pin state and provide the local tab key that runtime sync maps to the host session tab id. Join on `unifiedTab.entityId === browserWorkspace.id`; do not guess that those ids are equal, or that the unified id always equals the host id. Merge into an existing row or create a zero-sample row only from canonical repo/worktree metadata. Exclude floating, folder, unknown, and removed keys.
2. Make workspace rows expandable when they contain terminal sessions or browser workspaces. Count outer `BrowserWorkspace` tabs, not nested `BrowserPage`s. Show a quiet globe/count beside the workspace name and render each browser as a dense child row with the canonical browser-tab title/URL fallback. Reserve blank CPU/memory cells and the trailing-action gutter; per-browser metrics are unavailable and the workspace metric must not be presented as browser RAM.
3. Put the activation target and X in sibling buttons; do not nest a button inside a `role="button"` row. Activation closes the popover only after a fresh `useAppStore.getState()` lookup confirms the canonical worktree, browser workspace, and matching unified browser tab. Then call `activateAndRevealWorktree`, focus the unified tab's group, activate its unified id, select the browser workspace, and set the browser surface. For a runtime-owned browser with positive page/handle ownership, also call `activateWebRuntimeSessionTab` with the unified tab id. Plain SSH-owned/client-local browsers stay local; an SSH `connectionId` alone must neither force nor veto activation's runtime branch, which is gated by positive runtime browser ownership.
4. Add one shared Resource Manager browser action module rather than duplicating JSX lifecycle logic. Close resolves the target again at click time and again inside the pinned-confirm callback. Local and SSH-local tabs call `destroyWorkspaceWebviews` before `closeBrowserTab`, retaining local recently-closed and unified-tab cleanup behavior. Runtime-owned tabs call `closeWebRuntimeSessionTab` with the unified id (so runtime sync resolves the real host id and records the existing close intent), then optimistically prune the local browser/unified mirror with a dedicated no-history transition; a runtime-scoped unified browser with no local pages is still host-closed. Do not reuse `closeBrowserTab` for this remote prune: it records a local recently-closed snapshot and sends per-page `browser.tabClose` RPCs in addition to the authoritative session-tab close. After local or optimistic remote cleanup, choose a current editor/terminal/browser sibling, and deactivate only when the active worktree has no renderable surfaces.
5. Add an eligible browser total beside the terminal total. It must count the same unique, matched browser-workspace/unified-browser pairs that the open merge renders, under the same repo-worktree eligibility rule, so every counted browser has a visible Resource Manager row. The closed selector returns a primitive and memoizes structural count inputs; title/URL/loading/favicon changes may recompute the selector but must not rerender the segment. Update tooltip/ARIA copy and change “Resource Manager - Terminals” to “Resource Manager.”
6. Keep all copy localized through the existing catalogs. Use only documented tokens, Lucide `Globe`/`X`, existing shadcn tooltip/dialog behavior, and the surrounding Resource Manager row density.

## Data flow

```text
browserTabsByWorktree + unifiedTabsByWorktree + canonical repo/worktree metadata
  ├─ eligible primitive total selector ──> closed Resource Manager trigger
  └─ open-only slices ──> mergeSnapshotAndSessions ──> repo/workspace/browser rows
                                                       ├─ activate ──> fresh lookup + group/tab/workspace + optional host RPC
                                                       └─ close ──> fresh lookup + pin guard + local cleanup OR mirror prune + host close
```

## Edge cases

- A browser-only repo workspace must appear even without a memory snapshot or daemon session.
- Browser resources attach once when memory and daemon sources already created the workspace row.
- Unknown, removed, orphan, floating, and folder workspace keys neither create rows nor inflate the trigger total.
- SSH and runtime-owned repo workspaces remain visible. SSH connection metadata is not runtime-browser ownership; only `browserWorkspaceHasRemoteOwner` (or the explicit pageless runtime-mirror close case) permits a host RPC.
- A runtime mirror with no local page snapshot is closeable by routing its unified id through the runtime session-tab mapping, but navigation is a no-op until the browser workspace/unified pair is present.
- Closing a pinned browser respects the global confirmation setting.
- A tab removed or moved while the pin dialog is open is re-resolved on confirm; it is never closed by a stale captured object.
- Closing the active final browser chooses an existing editor/terminal fallback, or deactivates an otherwise empty active workspace rather than rendering a blank surface.
- Closing or navigating a stale browser row is a no-op.
- A failed remote close is not reported as success: keep the existing close-intent TTL/reconciliation behavior and surface a transient failure; after the intent expires, a later authoritative host snapshot may restore the optimistically pruned row.
- Concurrent remote snapshots may replace title, group, ownership handle, or the tab itself. Render from subscribed open slices, but execute actions only from fresh state and stable ids.
- Other Orca windows are not mutated by local DOM cleanup. Host-owned closes converge to other clients through the runtime snapshot; local browser totals remain per-window.
- Browser metadata churn with an unchanged count does not rerender the closed trigger; the full browser map is subscribed only while the popover is open.
- Singular/plural tooltip and screen-reader copy remains correct at zero, one, and many terminal/browser resources.

## Test plan

- Unit: open-slice selectors return stable empty browser/unified inputs while closed and real inputs while open; the closed selector ignores metadata-only writes, excludes ineligible keys, and counts only unique matched browser/unified pairs.
- Unit: the merge joins workspace and unified ids without assuming equality, counts outer workspaces rather than pages, creates browser-only canonical rows, includes runtime-scoped repo rows, and excludes unknown/floating/folder keys.
- Unit: browser navigation focuses the correct split group, activates local and positively host-owned runtime tabs with the correct unified id, leaves SSH-local tabs local, and rejects missing/moved targets without creating a terminal.
- Unit: browser close revalidates after pin confirmation; covers local webview destruction ordering, local recently-closed state, remote no-history/no-per-page-RPC pruning, pageless runtime host close, RPC failure/reappearance after close-intent expiry, sibling selection, and empty-workspace fallback.
- Component: workspace rows show the correct globe/count, expand browser children, expose accessible open/close actions, and retain terminal/SSH/orphan behavior.
- Component: activation and close are sibling controls with independent focus rings, localized labels, no nested interactive roles, blank aligned metric cells, and no propagation from X to activation.
- Unit: trigger tooltip/ARIA copy covers zero/one/many eligible terminal and browser totals and never disagrees with the open tree.
- Regression: existing Resource Manager session navigation, daemon actions, sorting, and closed-popover no-polling tests remain green.
- Electron: validate local and SSH-associated client-local browsers. Paired-runtime validation must prove host-owned navigation/close, pageless close, and convergence after an external host mutation.

## UI quality bar

The Resource Manager remains monochrome and quiet. Browser identity uses a small Lucide globe and tabular count; no new color or badge surface competes with CPU/memory. Browser child rows align with terminal rows, truncate safely at the 26rem popover width and viewport max-width, preserve visible focus/hover states, and keep the close affordance discoverable without permanently filling every row with destructive color. Light/dark themes and narrow windows must show no clipping, overlap, wrapping, or layout jump.

## Review screenshots

1. Full Orca window with the Resource Manager closed, showing distinct terminal and browser totals in the status bar.
2. Full Orca window with the Resource Manager open, showing at least two workspaces with different browser counts plus one terminal-only workspace.
3. Full Orca window after activating a background browser from its Resource Manager row, with the owning split group, workspace, and browser visibly selected.
4. Full Orca window after closing an unpinned local browser, showing the count and row removed while sibling resources remain.
5. Full Orca window with the pinned-browser confirmation opened from Resource Manager.
6. Full Orca window at a narrow supported width with the Resource Manager open and long browser/workspace labels truncated cleanly.
7. Paired-runtime client before/after host-owned close, with evidence that the host tab and client row converge; include an SSH-associated local browser in the open tree to prove it does not take the runtime path.

## Rollout

1. Add browser view-model types, open-only selectors, merge behavior, and unit coverage.
2. Add the shared Resource Manager browser resolver/actions and unit coverage, including fresh-state revalidation and distinct local/SSH/runtime branches.
3. Render browser counts/rows in Resource Manager and add row coverage.
4. Update trigger/header/settings copy and locale catalogs.
5. Run focused tests, typecheck, lint, localization verification, max-lines ratchet, then Electron scenarios and screenshots.

## Lightweight Eng Review

- Scope: Kept to the existing Resource Manager and existing browser state/lifecycle. Removed sidebar UI, per-browser metrics, new IPC, bulk close, floating-workspace support, and new telemetry.
- Architecture/data flow: Browser workspace state is joined with unified browser tabs and canonical repo/worktree metadata behind open gating; the closed trigger applies the identical eligibility rule. Stable ids cross the render/action boundary and every action re-resolves current state.
- Failure modes covered:
  - Browser-only workspaces missing from snapshot/session inputs.
  - Stale rows and externally removed workspaces/tabs.
  - Pinned close bypassing confirmation.
  - Runtime host close omitted for pageless mirrors, sent with a workspace id instead of the unified host id, or incorrectly sent for SSH/local fallback pages.
  - Target moved/closed while a pin dialog is open.
  - Trigger count disagreeing with the filtered open tree.
  - Last active browser leaving an empty blank workspace.
  - High-churn browser metadata rerendering the always-mounted status segment.
- Test coverage required:
  - Pure merge/selector tests for ownership, gating, unknown keys, and runtime rows.
  - Pure action tests for activation, close, pin, runtime, stale, and fallback cases.
  - Component row tests for count, expansion, accessibility, and terminal regressions.
  - Electron/paired-runtime validation for the seven review screenshot states.
- Performance/blast radius: No polling or IPC is added. Closed cost is a memoized structural count over eligible repo-worktree browser tabs; full browser/unified objects and merge work remain popover-open only. Open rendering is O(workspaces + sessions + browser tabs), bounded by the existing scroll container.
- UI quality bar: Match `docs/STYLEGUIDE.md`, existing status-bar/Resource Manager density, canonical tokens, Lucide icons, stable metric gutters, keyboard focus, and quiet hover-revealed destructive actions in light/dark and narrow layouts.
- Required review screenshots:
  1. Closed trigger totals.
  2. Open grouped browser resources.
  3. Browser navigation result.
  4. Browser close result.
  5. Pinned close confirmation.
  6. Narrow-layout truncation.
  7. Paired-runtime host-close convergence with an adjacent SSH-local browser.
- Residual risks: Renderer state still cannot attribute CPU/memory to individual browser tabs, so users can locate and close them but cannot rank them by measured RAM. Local inventory is per-window; global local-browser management would require a separate main-process authority and IPC design.
