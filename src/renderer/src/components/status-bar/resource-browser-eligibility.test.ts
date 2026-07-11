import { describe, expect, it } from 'vitest'
import type { BrowserWorkspace, Repo, Tab, Worktree } from '../../../../shared/types'
import {
  buildResourceBrowserCanonicalWorktreeMap,
  countEligibleResourceBrowsers,
  getEligibleResourceBrowserRows
} from './resource-browser-eligibility'

function repo(id: string, kind: 'git' | 'folder' = 'git'): Repo {
  return { id, kind, displayName: id } as Repo
}

function worktree(id: string, repoId = 'repo'): Worktree {
  return { id, repoId, displayName: id } as Worktree
}

function browser(id: string, worktreeId = 'wt'): BrowserWorkspace {
  return {
    id,
    worktreeId,
    title: `Title ${id}`,
    url: `https://${id}.test/path`,
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 0
  }
}

function unified(id: string, entityId: string, worktreeId = 'wt'): Tab {
  return {
    id,
    entityId,
    worktreeId,
    groupId: 'group',
    contentType: 'browser',
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}

describe('resource browser eligibility', () => {
  it('joins browser workspaces to unified browser tabs by entity id', () => {
    const canonicalWorktreeById = buildResourceBrowserCanonicalWorktreeMap(
      [repo('repo')],
      [worktree('wt')]
    )
    const rows = getEligibleResourceBrowserRows({
      canonicalWorktreeById,
      browserTabsByWorktree: { wt: [browser('workspace')] },
      unifiedTabsByWorktree: { wt: [unified('unified-id', 'workspace')] }
    })

    expect(rows.get('wt')).toEqual([
      expect.objectContaining({
        workspaceId: 'workspace',
        unifiedTabId: 'unified-id',
        groupId: 'group',
        label: 'Title workspace'
      })
    ])
  })

  it('counts each unique matched outer workspace once', () => {
    expect(
      countEligibleResourceBrowsers({
        repos: [repo('repo')],
        worktrees: [worktree('wt')],
        browserTabsByWorktree: { wt: [browser('one'), browser('one'), browser('two')] },
        unifiedTabsByWorktree: {
          wt: [unified('u-one', 'one'), unified('u-one-copy', 'one'), unified('u-two', 'two')]
        }
      })
    ).toBe(2)
  })

  it('excludes unknown, moved, folder, floating, and unmatched entries', () => {
    expect(
      countEligibleResourceBrowsers({
        repos: [repo('repo'), repo('folder', 'folder')],
        worktrees: [worktree('wt'), worktree('folder-wt', 'folder')],
        browserTabsByWorktree: {
          wt: [browser('matched'), browser('moved', 'elsewhere'), browser('unmatched')],
          unknown: [browser('unknown', 'unknown')],
          'folder-wt': [browser('folder-browser', 'folder-wt')],
          'global-floating-terminal': [browser('floating', 'global-floating-terminal')]
        },
        unifiedTabsByWorktree: {
          wt: [unified('u-match', 'matched'), unified('u-moved', 'moved')],
          unknown: [unified('u-unknown', 'unknown', 'unknown')],
          'folder-wt': [unified('u-folder', 'folder-browser', 'folder-wt')],
          'global-floating-terminal': [
            unified('u-floating', 'floating', 'global-floating-terminal')
          ]
        }
      })
    ).toBe(1)
  })
})
