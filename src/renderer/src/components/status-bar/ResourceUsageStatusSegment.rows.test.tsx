// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORPHAN_WORKTREE_ID } from '../../../../shared/constants'
import type { UnifiedSessionRow, UnifiedWorktreeRow } from './resource-usage-merge-types'

vi.mock('@/store', () => {
  const storeState = {}
  const useAppStore = Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState }
  )
  return { useAppStore }
})

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    values
      ? Object.entries(values).reduce(
          (text, [token, value]) => text.replace(`{{${token}}}`, value),
          fallback
        )
      : fallback
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() }
}))

import { WorktreeRow } from './ResourceUsageStatusSegment'

function makeSession(overrides: Partial<UnifiedSessionRow>): UnifiedSessionRow {
  return {
    sessionId: 'sess-1',
    paneKey: null,
    pid: 100,
    label: 'zsh',
    bound: true,
    tabId: 'tab-1',
    cpu: 1,
    memory: 100,
    hasLocalSamples: true,
    ...overrides
  }
}

function makeWorktree(overrides: Partial<UnifiedWorktreeRow>): UnifiedWorktreeRow {
  return {
    worktreeId: 'wt-1',
    worktreeName: 'feature-branch',
    repoId: 'repo-1',
    repoName: 'repo',
    cpu: 1,
    memory: 100,
    history: [],
    hasLocalSamples: true,
    isRemote: false,
    sessions: [],
    browsers: [],
    ...overrides
  }
}

describe('resource manager row presentation', () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function renderWorktreeRow(
    worktree: UnifiedWorktreeRow,
    actions: { activate?: () => void; close?: () => void } = {}
  ): void {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <WorktreeRow
          worktree={worktree}
          storeRecord={null}
          activeWorktreeId={null}
          isCollapsed={false}
          onToggle={() => {}}
          onNavigate={() => {}}
          onDelete={() => {}}
          onKillSession={() => {}}
          navigateToTab={() => {}}
          onActivateBrowser={() => actions.activate?.()}
          onCloseBrowser={() => actions.close?.()}
        />
      )
    })
  }

  it('keeps the remote chip and kill affordances on SSH-backed rows', () => {
    renderWorktreeRow(
      makeWorktree({
        isRemote: true,
        cpu: null,
        memory: null,
        sessions: [
          makeSession({ sessionId: 'ssh-a', bound: true }),
          makeSession({ sessionId: 'ssh-b', bound: false, tabId: null, cpu: null, memory: null })
        ]
      })
    )

    expect(container.textContent).toContain('· remote')
    const killButtons = container.querySelectorAll('button[aria-label^="Kill session"]')
    expect(killButtons).toHaveLength(2)
    expect(container.querySelector('button[aria-label="Kill session ssh-a"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Kill session ssh-b"]')).not.toBeNull()
  })

  it('keeps kill affordances on the orphan bucket rows', () => {
    renderWorktreeRow(
      makeWorktree({
        worktreeId: ORPHAN_WORKTREE_ID,
        worktreeName: 'Orphaned terminals',
        sessions: [makeSession({ sessionId: 'orphan-a', bound: false, tabId: null })]
      })
    )

    expect(container.querySelector('button[aria-label="Kill session orphan-a"]')).not.toBeNull()
  })

  it('shows browser counts and sibling open/close controls', () => {
    const activate = vi.fn()
    const close = vi.fn()
    renderWorktreeRow(
      makeWorktree({
        cpu: null,
        memory: null,
        browsers: [
          {
            workspaceId: 'browser-1',
            unifiedTabId: 'unified-1',
            groupId: 'group-1',
            label: 'Docs',
            url: 'https://docs.test',
            isPinned: false
          },
          {
            workspaceId: 'browser-2',
            unifiedTabId: 'unified-2',
            groupId: 'group-1',
            label: 'Preview',
            url: 'https://preview.test',
            isPinned: false
          }
        ]
      }),
      { activate, close }
    )

    const openButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open browser Docs"]'
    )
    const closeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close browser Docs"]'
    )
    expect(container.textContent).toContain('Docs')
    expect(
      Array.from(container.querySelectorAll('span')).some(
        (span) => span.textContent?.trim() === '2'
      )
    ).toBe(true)
    expect(container.querySelector('button[aria-label="Collapse workspace"]')).not.toBeNull()
    expect(openButton).not.toBeNull()
    expect(closeButton).not.toBeNull()
    expect(openButton?.contains(closeButton)).toBe(false)
    expect(closeButton?.closest('button')).toBe(closeButton)

    act(() => closeButton?.click())
    expect(close).toHaveBeenCalledTimes(1)
    expect(activate).not.toHaveBeenCalled()
    act(() => openButton?.click())
    expect(activate).toHaveBeenCalledTimes(1)
  })
})
