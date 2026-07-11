import { describe, expect, it } from 'vitest'
import type { BrowserWorkspace, Tab } from '../../../../shared/types'
import { mergeSnapshotAndSessions } from './mergeSnapshotAndSessions'
import type { MergeContext, ResourceBrowserCanonicalWorktree } from './resource-usage-merge-types'

const canonical: ResourceBrowserCanonicalWorktree = {
  worktreeId: 'wt',
  worktreeName: 'Workspace',
  repoId: 'repo',
  repoName: 'Repo',
  isRemote: false
}

function browser(id: string): BrowserWorkspace {
  return {
    id,
    worktreeId: 'wt',
    title: 'Docs',
    url: 'https://docs.test',
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 0
  }
}

function unified(id: string, entityId: string): Tab {
  return {
    id,
    entityId,
    worktreeId: 'wt',
    groupId: 'group',
    contentType: 'browser',
    label: 'Docs',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}

function context(overrides: Partial<MergeContext> = {}): MergeContext {
  return {
    tabsByWorktree: {},
    ptyIdsByTabId: {},
    runtimePaneTitlesByTabId: {},
    workspaceSessionReady: true,
    repoDisplayNameById: new Map(),
    repoConnectionIdById: new Map(),
    repoRuntimeScopedById: new Map(),
    browserCanonicalWorktreeById: new Map([['wt', canonical]]),
    browserTabsByWorktree: { wt: [browser('browser')] },
    unifiedTabsByWorktree: { wt: [unified('unified', 'browser')] },
    ...overrides
  }
}

describe('mergeSnapshotAndSessions browser rows', () => {
  it('creates a zero-sample canonical row for a browser-only workspace', () => {
    const result = mergeSnapshotAndSessions(null, [], context())

    expect(result).toEqual([
      expect.objectContaining({
        repoId: 'repo',
        cpu: null,
        memory: null,
        worktrees: [
          expect.objectContaining({
            worktreeId: 'wt',
            sessions: [],
            browsers: [expect.objectContaining({ workspaceId: 'browser', unifiedTabId: 'unified' })]
          })
        ]
      })
    ])
  })

  it('keeps runtime-scoped browser rows while local memory/session inputs stay excluded', () => {
    const result = mergeSnapshotAndSessions(
      null,
      [{ id: 'wt@@pty', cwd: '', title: 'terminal' }],
      context({ repoRuntimeScopedById: new Map([['repo', true]]) })
    )

    const runtimeRepo = result.find((repo) => repo.repoId === 'repo')
    expect(runtimeRepo?.worktrees[0].sessions).toEqual([])
    expect(runtimeRepo?.worktrees[0].browsers).toHaveLength(1)
  })

  it('does not create rows for missing canonical metadata or unmatched unified ids', () => {
    expect(
      mergeSnapshotAndSessions(null, [], context({ browserCanonicalWorktreeById: new Map() }))
    ).toEqual([])
    expect(
      mergeSnapshotAndSessions(null, [], context({ unifiedTabsByWorktree: { wt: [] } }))
    ).toEqual([])
  })
})
