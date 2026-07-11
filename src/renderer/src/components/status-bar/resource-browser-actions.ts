import { toast } from 'sonner'
import type { AppState } from '../../store'
import { useAppStore } from '../../store'
import { getAllWorktreesFromState } from '../../store/selectors'
import { destroyWorkspaceWebviews } from '../../store/slices/browser-webview-cleanup'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { getExplicitRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { browserWorkspaceHasRemoteOwner } from '@/runtime/remote-browser-tab-ownership'
import {
  activateWebRuntimeSessionTab,
  closeWebRuntimeSessionTab
} from '@/runtime/web-runtime-session'
import { guardPinnedTabClose } from '../../store/pinned-tab-close-guard'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { translate } from '@/i18n/i18n'

export type ResourceBrowserTarget = {
  worktreeId: string
  workspaceId: string
  unifiedTabId: string
}

type ResolvedResourceBrowser = ResourceBrowserTarget & {
  groupId: string
  label: string
  isPinned: boolean
  runtimeEnvironmentId: string | null
  hasLocalPages: boolean
  hasPositiveRuntimeOwner: boolean
}

export type ResourceBrowserActionDependencies = {
  getState: () => AppState
  activateWorktree: typeof activateAndRevealWorktree
  activateRuntimeTab: typeof activateWebRuntimeSessionTab
  closeRuntimeTab: typeof closeWebRuntimeSessionTab
  destroyWebviews: typeof destroyWorkspaceWebviews
  reportCloseFailure: () => void
  guardPinnedClose: typeof guardPinnedTabClose
}

const defaultDependencies: ResourceBrowserActionDependencies = {
  getState: useAppStore.getState,
  activateWorktree: activateAndRevealWorktree,
  activateRuntimeTab: activateWebRuntimeSessionTab,
  closeRuntimeTab: closeWebRuntimeSessionTab,
  destroyWebviews: destroyWorkspaceWebviews,
  guardPinnedClose: guardPinnedTabClose,
  reportCloseFailure: () =>
    toast.error(
      translate('resourceManager.closeFailed', 'Could not close the browser on the remote host.')
    )
}

function getPositiveRuntimeOwnerEnvironmentId(state: AppState, workspaceId: string): string | null {
  for (const page of state.browserPagesByWorkspace[workspaceId] ?? []) {
    const environmentId =
      state.remoteBrowserPageHandlesByPageId[page.id]?.environmentId?.trim() ||
      page.browserRuntimeEnvironmentId?.trim()
    if (environmentId) {
      return environmentId
    }
  }
  return null
}

export function resolveResourceBrowserTarget(
  state: AppState,
  target: ResourceBrowserTarget
): ResolvedResourceBrowser | null {
  const worktree = getAllWorktreesFromState(state).find(
    (candidate) => candidate.id === target.worktreeId
  )
  const repo = worktree ? state.repos.find((candidate) => candidate.id === worktree.repoId) : null
  if (!worktree || !repo || isFolderRepo(repo)) {
    return null
  }
  const workspace = (state.browserTabsByWorktree[target.worktreeId] ?? []).find(
    (candidate) => candidate.id === target.workspaceId && candidate.worktreeId === target.worktreeId
  )
  const unifiedTab = (state.unifiedTabsByWorktree[target.worktreeId] ?? []).find(
    (candidate) =>
      candidate.id === target.unifiedTabId &&
      candidate.entityId === target.workspaceId &&
      candidate.contentType === 'browser' &&
      candidate.worktreeId === target.worktreeId
  )
  if (!workspace || !unifiedTab) {
    return null
  }
  const positiveOwnerEnvironmentId = getPositiveRuntimeOwnerEnvironmentId(state, workspace.id)
  return {
    ...target,
    groupId: unifiedTab.groupId,
    label:
      workspace.title.trim() ||
      workspace.url.trim() ||
      translate('resourceManager.browserFallback', 'Browser'),
    isPinned: unifiedTab.isPinned === true,
    runtimeEnvironmentId:
      positiveOwnerEnvironmentId ??
      getExplicitRuntimeEnvironmentIdForWorktree(state, target.worktreeId),
    hasLocalPages: (state.browserPagesByWorkspace[workspace.id] ?? []).length > 0,
    hasPositiveRuntimeOwner: Boolean(
      positiveOwnerEnvironmentId &&
      browserWorkspaceHasRemoteOwner(state, workspace.id, positiveOwnerEnvironmentId)
    )
  }
}

function settleAfterResourceBrowserClose(state: AppState, worktreeId: string): void {
  if (state.activeWorktreeId !== worktreeId) {
    return
  }
  const reconciliation = state.reconcileWorktreeTabModel(worktreeId)
  if (reconciliation.activeRenderableTabId) {
    state.activateTab(reconciliation.activeRenderableTabId)
    return
  }
  if (reconciliation.renderableTabCount === 0) {
    state.setActiveWorktree(null)
  }
}

export function activateResourceBrowser(
  target: ResourceBrowserTarget,
  setPopoverOpen: (open: boolean) => void,
  dependencies: ResourceBrowserActionDependencies = defaultDependencies
): boolean {
  const resolved = resolveResourceBrowserTarget(dependencies.getState(), target)
  if (!resolved) {
    return false
  }
  setPopoverOpen(false)
  dependencies.activateWorktree(resolved.worktreeId)
  const state = dependencies.getState()
  state.focusGroup(resolved.worktreeId, resolved.groupId)
  state.activateTab(resolved.unifiedTabId)
  state.setActiveBrowserTab(resolved.workspaceId)
  state.setActiveTabType('browser')
  if (resolved.hasPositiveRuntimeOwner && resolved.runtimeEnvironmentId) {
    void dependencies.activateRuntimeTab({
      worktreeId: resolved.worktreeId,
      tabId: resolved.unifiedTabId,
      environmentId: resolved.runtimeEnvironmentId
    })
  }
  return true
}

function closeResolvedResourceBrowser(
  target: ResourceBrowserTarget,
  dependencies: ResourceBrowserActionDependencies
): boolean {
  const resolved = resolveResourceBrowserTarget(dependencies.getState(), target)
  if (!resolved) {
    return false
  }
  const state = dependencies.getState()
  const pagelessRuntimeMirror = Boolean(!resolved.hasLocalPages && resolved.runtimeEnvironmentId)
  if (resolved.hasPositiveRuntimeOwner || pagelessRuntimeMirror) {
    void dependencies
      .closeRuntimeTab({
        worktreeId: resolved.worktreeId,
        tabId: resolved.unifiedTabId,
        environmentId: resolved.runtimeEnvironmentId
      })
      .then((closed) => {
        if (!closed) {
          dependencies.reportCloseFailure()
        }
      })
    state.pruneRemoteBrowserTabMirror(
      resolved.worktreeId,
      resolved.workspaceId,
      resolved.unifiedTabId
    )
  } else {
    dependencies.destroyWebviews(state.browserPagesByWorkspace, resolved.workspaceId)
    state.closeBrowserTab(resolved.workspaceId)
  }
  settleAfterResourceBrowserClose(dependencies.getState(), resolved.worktreeId)
  return true
}

export function closeResourceBrowser(
  target: ResourceBrowserTarget,
  dependencies: ResourceBrowserActionDependencies = defaultDependencies
): boolean {
  const resolved = resolveResourceBrowserTarget(dependencies.getState(), target)
  if (!resolved) {
    return false
  }
  dependencies.guardPinnedClose({
    isPinned: resolved.isPinned,
    tabLabel: resolved.label,
    // Why: the tab can move or disappear while confirmation is open; stable
    // ids cross the dialog boundary and are resolved again on confirmation.
    onClose: () => {
      closeResolvedResourceBrowser(target, dependencies)
    }
  })
  return true
}
