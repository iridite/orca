import { describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import { createBrowserSlice } from './browser'

function createTestStore() {
  return create<AppState>()(
    (...args) =>
      ({
        settings: {} as AppState['settings'],
        activeWorktreeId: 'wt',
        unifiedTabsByWorktree: {},
        tabBarOrderByWorktree: {},
        tabsByWorktree: {},
        openFiles: [],
        activeTabType: 'browser',
        activeTabTypeByWorktree: {},
        worktreesByRepo: {},
        closeUnifiedTab: vi.fn(),
        recordFeatureInteraction: vi.fn(),
        ...createBrowserSlice(...args)
      }) as unknown as AppState
  )
}

describe('remote browser mirror prune', () => {
  it('removes browser state without recently-closed history or page RPCs', () => {
    const store = createTestStore()
    store.setState({
      browserTabsByWorktree: {
        wt: [
          {
            id: 'browser',
            worktreeId: 'wt',
            title: 'Docs',
            url: 'https://docs.test'
          }
        ]
      } as unknown as AppState['browserTabsByWorktree'],
      browserPagesByWorkspace: {
        browser: [{ id: 'page', workspaceId: 'browser', worktreeId: 'wt' }]
      } as unknown as AppState['browserPagesByWorkspace'],
      browserAnnotationsByPageId: {
        page: [{}]
      } as unknown as AppState['browserAnnotationsByPageId'],
      remoteBrowserPageHandlesByPageId: {
        page: { environmentId: 'runtime', remotePageId: 'remote-page' }
      },
      activeBrowserTabId: 'browser',
      activeBrowserTabIdByWorktree: { wt: 'browser' },
      pendingAddressBarFocusByPageId: { page: true as const },
      pendingAddressBarFocusByTabId: { browser: true as const },
      tabBarOrderByWorktree: { wt: ['browser'] },
      unifiedTabsByWorktree: {
        wt: [
          {
            id: 'unified',
            entityId: 'browser',
            worktreeId: 'wt',
            groupId: 'group',
            contentType: 'browser'
          }
        ]
      } as unknown as AppState['unifiedTabsByWorktree'],
      recentlyClosedBrowserTabsByWorktree: { wt: [] }
    })

    expect(store.getState().pruneRemoteBrowserTabMirror('wt', 'browser', 'unified')).toBe(true)

    expect(store.getState().browserTabsByWorktree.wt).toBeUndefined()
    expect(store.getState().browserPagesByWorkspace.browser).toBeUndefined()
    expect(store.getState().browserAnnotationsByPageId.page).toBeUndefined()
    expect(store.getState().remoteBrowserPageHandlesByPageId.page).toBeUndefined()
    expect(store.getState().recentlyClosedBrowserTabsByWorktree.wt).toEqual([])
    expect(store.getState().pendingAddressBarFocusByPageId.page).toBeUndefined()
    expect(store.getState().pendingAddressBarFocusByTabId.browser).toBeUndefined()
    expect(store.getState().tabBarOrderByWorktree.wt).toEqual([])
    expect(store.getState().closeUnifiedTab).toHaveBeenCalledWith('unified')
  })

  it('rejects stale or moved targets without changing state', () => {
    const store = createTestStore()
    expect(store.getState().pruneRemoteBrowserTabMirror('wt', 'missing', 'unified')).toBe(false)
    expect(store.getState().closeUnifiedTab).not.toHaveBeenCalled()
  })
})
