import { describe, expect, it } from 'vitest'
import {
  formatBrowserCount,
  formatTerminalSessionCount,
  getResourceManagerAriaLabel,
  getResourceManagerTooltipLines
} from './resource-manager-copy'

describe('resource manager copy', () => {
  it('formats terminal session counts with the terminal noun visible', () => {
    expect(formatTerminalSessionCount(1)).toBe('1 terminal session')
    expect(formatTerminalSessionCount(3)).toBe('3 terminal sessions')
  })

  it('formats browser counts with singular and plural nouns', () => {
    expect(formatBrowserCount(1)).toBe('1 browser')
    expect(formatBrowserCount(3)).toBe('3 browsers')
  })

  it('points users from the status-bar count back to workspace terminals', () => {
    expect(
      getResourceManagerTooltipLines({
        memoryLabel: '512 MB',
        sessionCount: 2,
        browserCount: 1,
        spaceScanReady: false
      })
    ).toEqual([
      'Resource Manager - 512 MB - 2 terminal sessions - 1 browser',
      'Terminal sessions and browsers are grouped by workspace.'
    ])
  })

  it('keeps local session copy active under runtime focus', () => {
    expect(
      getResourceManagerTooltipLines({
        memoryLabel: '-',
        sessionCount: 0,
        browserCount: 0,
        spaceScanReady: true
      })
    ).toEqual([
      'Resource Manager - memory unavailable - 0 terminal sessions - 0 browsers',
      'Space scan ready',
      'No terminal sessions or browsers yet.'
    ])
  })

  it('keeps the trigger label descriptive for screen readers', () => {
    expect(
      getResourceManagerAriaLabel({
        sessionCount: 1,
        browserCount: 2,
        spaceScanReady: true
      })
    ).toBe('Resource Manager, 1 terminal session, 2 browsers, Space scan ready')
  })
})
