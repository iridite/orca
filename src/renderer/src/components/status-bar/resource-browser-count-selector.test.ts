import { describe, expect, it } from 'vitest'
import type { AppState } from '../../store'
import { createClosedResourceBrowserCountSelector } from './resource-browser-count-selector'

function state(): Pick<
  AppState,
  'repos' | 'worktreesByRepo' | 'browserTabsByWorktree' | 'unifiedTabsByWorktree'
> {
  return {
    repos: [{ id: 'repo', kind: 'git', displayName: 'Repo' }] as AppState['repos'],
    worktreesByRepo: {
      repo: [{ id: 'wt', repoId: 'repo', displayName: 'Workspace' }]
    } as unknown as AppState['worktreesByRepo'],
    browserTabsByWorktree: {
      wt: [{ id: 'browser', worktreeId: 'wt', title: 'Docs', url: 'https://docs.test' }]
    } as unknown as AppState['browserTabsByWorktree'],
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
    } as unknown as AppState['unifiedTabsByWorktree']
  }
}

describe('closed resource browser count selector', () => {
  it('returns the eligible matched count', () => {
    expect(createClosedResourceBrowserCountSelector()(state())).toBe(1)
  })

  it('keeps a primitive result across metadata-only writes', () => {
    const selector = createClosedResourceBrowserCountSelector()
    const first = state()
    expect(selector(first)).toBe(1)
    expect(
      selector({
        ...first,
        browserTabsByWorktree: {
          wt: [{ ...first.browserTabsByWorktree.wt[0], title: 'Changed', loading: true }]
        }
      })
    ).toBe(1)
  })

  it('drops removed worktrees and unmatched pairs', () => {
    const selector = createClosedResourceBrowserCountSelector()
    const first = state()
    expect(selector(first)).toBe(1)
    expect(selector({ ...first, unifiedTabsByWorktree: {} })).toBe(0)
    expect(selector({ ...first, worktreesByRepo: {} })).toBe(0)
  })
})
