import type { BrowserWorkspace, Repo, Tab, Worktree } from '../../../../shared/types'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { translate } from '@/i18n/i18n'
import type {
  ResourceBrowserCanonicalWorktree,
  UnifiedBrowserRow
} from './resource-usage-merge-types'

export type ResourceBrowserEligibilityInputs = {
  repos: readonly Repo[]
  worktrees: readonly Worktree[]
  browserTabsByWorktree: Record<string, BrowserWorkspace[]>
  unifiedTabsByWorktree: Record<string, Tab[]>
}

function resourceBrowserLabel(browser: BrowserWorkspace): string {
  const title = browser.title.trim()
  const url = browser.url.trim()
  if (title && title !== url && title !== 'about:blank') {
    return title
  }
  if (!url || url === 'about:blank') {
    return translate('resourceManager.newTab', 'New Tab')
  }
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}

export function buildResourceBrowserCanonicalWorktreeMap(
  repos: readonly Repo[],
  worktrees: readonly Worktree[]
): Map<string, ResourceBrowserCanonicalWorktree> {
  const repoById = new Map(
    repos.filter((repo) => !isFolderRepo(repo)).map((repo) => [repo.id, repo])
  )
  const result = new Map<string, ResourceBrowserCanonicalWorktree>()
  for (const worktree of worktrees) {
    const repo = repoById.get(worktree.repoId)
    if (!repo) {
      continue
    }
    result.set(worktree.id, {
      worktreeId: worktree.id,
      worktreeName: worktree.displayName.trim() || worktree.id,
      repoId: repo.id,
      repoName: repo.displayName.trim() || repo.id,
      isRemote: repo.connectionId?.trim() != null && repo.connectionId.trim().length > 0
    })
  }
  return result
}

export function getEligibleResourceBrowserRows(
  inputs: Pick<
    ResourceBrowserEligibilityInputs,
    'browserTabsByWorktree' | 'unifiedTabsByWorktree'
  > & {
    canonicalWorktreeById: ReadonlyMap<string, ResourceBrowserCanonicalWorktree>
  }
): Map<string, UnifiedBrowserRow[]> {
  const rowsByWorktree = new Map<string, UnifiedBrowserRow[]>()
  for (const [worktreeId, browsers] of Object.entries(inputs.browserTabsByWorktree)) {
    if (!inputs.canonicalWorktreeById.has(worktreeId)) {
      continue
    }
    const unifiedBrowsers = (inputs.unifiedTabsByWorktree[worktreeId] ?? []).filter(
      (tab) => tab.contentType === 'browser'
    )
    const unifiedByWorkspaceId = new Map<string, Tab>()
    for (const tab of unifiedBrowsers) {
      if (!unifiedByWorkspaceId.has(tab.entityId)) {
        unifiedByWorkspaceId.set(tab.entityId, tab)
      }
    }
    const seenWorkspaceIds = new Set<string>()
    const rows: UnifiedBrowserRow[] = []
    for (const browser of browsers) {
      const unifiedTab = unifiedByWorkspaceId.get(browser.id)
      if (
        !unifiedTab ||
        browser.worktreeId !== worktreeId ||
        unifiedTab.worktreeId !== worktreeId ||
        seenWorkspaceIds.has(browser.id)
      ) {
        continue
      }
      seenWorkspaceIds.add(browser.id)
      rows.push({
        workspaceId: browser.id,
        unifiedTabId: unifiedTab.id,
        groupId: unifiedTab.groupId,
        label: resourceBrowserLabel(browser),
        url: browser.url,
        isPinned: unifiedTab.isPinned === true
      })
    }
    if (rows.length > 0) {
      rowsByWorktree.set(worktreeId, rows)
    }
  }
  return rowsByWorktree
}

export function countEligibleResourceBrowsers(inputs: ResourceBrowserEligibilityInputs): number {
  const canonicalWorktreeById = buildResourceBrowserCanonicalWorktreeMap(
    inputs.repos,
    inputs.worktrees
  )
  let count = 0
  for (const [worktreeId, browsers] of Object.entries(inputs.browserTabsByWorktree)) {
    if (!canonicalWorktreeById.has(worktreeId)) {
      continue
    }
    const matchedWorkspaceIds = new Set(
      (inputs.unifiedTabsByWorktree[worktreeId] ?? [])
        .filter((tab) => tab.contentType === 'browser' && tab.worktreeId === worktreeId)
        .map((tab) => tab.entityId)
    )
    const seenWorkspaceIds = new Set<string>()
    for (const browser of browsers) {
      if (
        browser.worktreeId === worktreeId &&
        matchedWorkspaceIds.has(browser.id) &&
        !seenWorkspaceIds.has(browser.id)
      ) {
        seenWorkspaceIds.add(browser.id)
        count += 1
      }
    }
  }
  return count
}
