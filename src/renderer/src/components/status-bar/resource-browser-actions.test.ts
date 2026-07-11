import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '../../store'
import {
  activateResourceBrowser,
  closeResourceBrowser,
  resolveResourceBrowserTarget,
  type ResourceBrowserActionDependencies,
  type ResourceBrowserTarget
} from './resource-browser-actions'

const target: ResourceBrowserTarget = {
  worktreeId: 'wt',
  workspaceId: 'browser',
  unifiedTabId: 'unified'
}

function makeState(options?: {
  connectionId?: string
  hostId?: string
  pageRuntimeEnvironmentId?: string
  pageless?: boolean
  pinned?: boolean
}): AppState {
  const pages = options?.pageless
    ? []
    : [
        {
          id: 'page',
          workspaceId: 'browser',
          worktreeId: 'wt',
          browserRuntimeEnvironmentId: options?.pageRuntimeEnvironmentId
        }
      ]
  return {
    repos: [
      {
        id: 'repo',
        kind: 'git',
        displayName: 'Repo',
        connectionId: options?.connectionId
      }
    ],
    worktreesByRepo: {
      repo: [
        {
          id: 'wt',
          repoId: 'repo',
          displayName: 'Workspace',
          hostId: options?.hostId
        }
      ]
    },
    browserTabsByWorktree: {
      wt: [
        {
          id: 'browser',
          worktreeId: 'wt',
          title: 'Docs',
          url: 'https://docs.test'
        }
      ]
    },
    browserPagesByWorkspace: { browser: pages },
    remoteBrowserPageHandlesByPageId: {},
    unifiedTabsByWorktree: {
      wt: [
        {
          id: 'unified',
          entityId: 'browser',
          worktreeId: 'wt',
          groupId: 'group',
          contentType: 'browser',
          isPinned: options?.pinned
        }
      ]
    },
    activeWorktreeId: 'wt',
    focusGroup: vi.fn(),
    activateTab: vi.fn(),
    setActiveBrowserTab: vi.fn(),
    setActiveTabType: vi.fn(),
    closeBrowserTab: vi.fn(),
    pruneRemoteBrowserTabMirror: vi.fn(() => true),
    reconcileWorktreeTabModel: vi.fn(() => ({
      renderableTabCount: 1,
      activeRenderableTabId: 'sibling'
    })),
    setActiveWorktree: vi.fn()
  } as unknown as AppState
}

function dependencies(
  state: AppState,
  overrides: Partial<ResourceBrowserActionDependencies> = {}
): ResourceBrowserActionDependencies {
  return {
    getState: () => state,
    activateWorktree: vi.fn(() => ({ primaryTabId: null })),
    activateRuntimeTab: vi.fn().mockResolvedValue(true),
    closeRuntimeTab: vi.fn().mockResolvedValue(true),
    destroyWebviews: vi.fn(),
    reportCloseFailure: vi.fn(),
    guardPinnedClose: vi.fn(({ onClose }) => onClose()),
    ...overrides
  }
}

describe('resource browser actions', () => {
  it('activates the matched group and unified tab, then closes the popover', () => {
    const state = makeState()
    const deps = dependencies(state)
    const setOpen = vi.fn()

    expect(activateResourceBrowser(target, setOpen, deps)).toBe(true)

    expect(setOpen).toHaveBeenCalledWith(false)
    expect(deps.activateWorktree).toHaveBeenCalledWith('wt')
    expect(state.focusGroup).toHaveBeenCalledWith('wt', 'group')
    expect(state.activateTab).toHaveBeenCalledWith('unified')
    expect(state.setActiveBrowserTab).toHaveBeenCalledWith('browser')
    expect(state.setActiveTabType).toHaveBeenCalledWith('browser')
    expect(deps.activateRuntimeTab).not.toHaveBeenCalled()
  })

  it('uses the unified id for positively runtime-owned activation', () => {
    const state = makeState({ pageRuntimeEnvironmentId: 'runtime-1' })
    const deps = dependencies(state)

    activateResourceBrowser(target, vi.fn(), deps)

    expect(deps.activateRuntimeTab).toHaveBeenCalledWith({
      worktreeId: 'wt',
      tabId: 'unified',
      environmentId: 'runtime-1'
    })
  })

  it('keeps an SSH-associated client-local browser on the local close path', () => {
    const state = makeState({ connectionId: 'ssh-1' })
    const deps = dependencies(state)

    closeResourceBrowser(target, deps)

    expect(deps.destroyWebviews).toHaveBeenCalledWith(state.browserPagesByWorkspace, 'browser')
    expect(state.closeBrowserTab).toHaveBeenCalledWith('browser')
    expect(deps.closeRuntimeTab).not.toHaveBeenCalled()
    expect(state.pruneRemoteBrowserTabMirror).not.toHaveBeenCalled()
    expect(state.activateTab).toHaveBeenCalledWith('sibling')
  })

  it('destroys local webviews before closing browser state', () => {
    const state = makeState()
    const events: string[] = []
    state.closeBrowserTab = vi.fn(() => events.push('close-state'))
    const deps = dependencies(state, {
      destroyWebviews: vi.fn(() => events.push('destroy-webviews'))
    })

    closeResourceBrowser(target, deps)

    expect(events).toEqual(['destroy-webviews', 'close-state'])
  })

  it('host-closes and optimistically prunes positive runtime ownership', () => {
    const state = makeState({ connectionId: 'ssh-1', pageRuntimeEnvironmentId: 'runtime-1' })
    const deps = dependencies(state)

    closeResourceBrowser(target, deps)

    expect(deps.closeRuntimeTab).toHaveBeenCalledWith({
      worktreeId: 'wt',
      tabId: 'unified',
      environmentId: 'runtime-1'
    })
    expect(state.pruneRemoteBrowserTabMirror).toHaveBeenCalledWith('wt', 'browser', 'unified')
    expect(deps.destroyWebviews).not.toHaveBeenCalled()
    expect(state.closeBrowserTab).not.toHaveBeenCalled()
  })

  it('host-closes pageless mirrors only for explicit runtime worktrees', () => {
    const runtimeState = makeState({ hostId: 'runtime:runtime-1', pageless: true })
    const runtimeDeps = dependencies(runtimeState)
    closeResourceBrowser(target, runtimeDeps)
    expect(runtimeDeps.closeRuntimeTab).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 'unified', environmentId: 'runtime-1' })
    )

    const sshState = makeState({ connectionId: 'ssh-1', pageless: true })
    const sshDeps = dependencies(sshState)
    closeResourceBrowser(target, sshDeps)
    expect(sshDeps.closeRuntimeTab).not.toHaveBeenCalled()
    expect(sshState.closeBrowserTab).toHaveBeenCalledWith('browser')
  })

  it('re-resolves inside pinned confirmation and no-ops after removal', () => {
    const state = makeState({ pinned: true })
    let confirm: (() => void) | undefined
    const deps = dependencies(state, {
      guardPinnedClose: vi.fn(({ onClose }) => {
        confirm = onClose
      })
    })

    closeResourceBrowser(target, deps)
    state.browserTabsByWorktree = {}
    confirm?.()

    expect(state.closeBrowserTab).not.toHaveBeenCalled()
    expect(deps.closeRuntimeTab).not.toHaveBeenCalled()
  })

  it('rejects stale or moved targets without side effects', () => {
    const state = makeState()
    state.unifiedTabsByWorktree.wt[0].groupId = 'moved-group'
    const deps = dependencies(state)

    expect(
      resolveResourceBrowserTarget(state, { ...target, unifiedTabId: 'stale-unified' })
    ).toBeNull()
    expect(
      activateResourceBrowser({ ...target, unifiedTabId: 'stale-unified' }, vi.fn(), deps)
    ).toBe(false)
    expect(closeResourceBrowser({ ...target, unifiedTabId: 'stale-unified' }, deps)).toBe(false)
  })

  it('deactivates an active workspace after its final renderable surface closes', () => {
    const state = makeState()
    vi.mocked(state.reconcileWorktreeTabModel).mockReturnValue({
      renderableTabCount: 0,
      activeRenderableTabId: null
    })

    closeResourceBrowser(target, dependencies(state))

    expect(state.setActiveWorktree).toHaveBeenCalledWith(null)
  })

  it('surfaces a failed remote close so later host snapshots may restore it', async () => {
    const state = makeState({ pageRuntimeEnvironmentId: 'runtime-1' })
    const deps = dependencies(state, { closeRuntimeTab: vi.fn().mockResolvedValue(false) })

    closeResourceBrowser(target, deps)
    await Promise.resolve()

    expect(deps.reportCloseFailure).toHaveBeenCalledTimes(1)
  })
})
