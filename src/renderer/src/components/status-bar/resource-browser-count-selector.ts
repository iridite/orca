import type { AppState } from '../../store'
import { getAllWorktreesFromState } from '../../store/selectors'
import { countEligibleResourceBrowsers } from './resource-browser-eligibility'

export type ClosedResourceBrowserCountState = Pick<
  AppState,
  'repos' | 'worktreesByRepo' | 'browserTabsByWorktree' | 'unifiedTabsByWorktree'
>

export function createClosedResourceBrowserCountSelector(): (
  state: ClosedResourceBrowserCountState
) => number {
  let previousRepos: AppState['repos'] | null = null
  let previousWorktreesByRepo: AppState['worktreesByRepo'] | null = null
  let previousBrowserTabs: AppState['browserTabsByWorktree'] | null = null
  let previousUnifiedTabs: AppState['unifiedTabsByWorktree'] | null = null
  let count = 0

  return (state): number => {
    if (
      state.repos !== previousRepos ||
      state.worktreesByRepo !== previousWorktreesByRepo ||
      state.browserTabsByWorktree !== previousBrowserTabs ||
      state.unifiedTabsByWorktree !== previousUnifiedTabs
    ) {
      count = countEligibleResourceBrowsers({
        repos: state.repos,
        worktrees: getAllWorktreesFromState(state),
        browserTabsByWorktree: state.browserTabsByWorktree,
        unifiedTabsByWorktree: state.unifiedTabsByWorktree
      })
      previousRepos = state.repos
      previousWorktreesByRepo = state.worktreesByRepo
      previousBrowserTabs = state.browserTabsByWorktree
      previousUnifiedTabs = state.unifiedTabsByWorktree
    }
    return count
  }
}
