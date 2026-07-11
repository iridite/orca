import { translate } from '@/i18n/i18n'

export function formatTerminalSessionCount(count: number): string {
  return count === 1
    ? translate('resourceManager.terminalCount.one', '{{count}} terminal session', { count })
    : translate('resourceManager.terminalCount.other', '{{count}} terminal sessions', { count })
}

export function formatBrowserCount(count: number): string {
  return count === 1
    ? translate('resourceManager.browserCount.one', '{{count}} browser', { count })
    : translate('resourceManager.browserCount.other', '{{count}} browsers', { count })
}

export function getResourceManagerTooltipLines(args: {
  memoryLabel: string
  sessionCount: number
  browserCount: number
  spaceScanReady: boolean
}): string[] {
  const rawMemoryLabel = args.memoryLabel.trim()
  const memoryLabel =
    rawMemoryLabel === '' || rawMemoryLabel === '-' || rawMemoryLabel === '—'
      ? translate('resourceManager.memoryUnavailable', 'memory unavailable')
      : rawMemoryLabel
  const lines = [
    translate(
      'resourceManager.tooltip.summary',
      'Resource Manager - {{memory}} - {{terminals}} - {{browsers}}',
      {
        memory: memoryLabel,
        terminals: formatTerminalSessionCount(args.sessionCount),
        browsers: formatBrowserCount(args.browserCount)
      }
    )
  ]

  if (args.spaceScanReady) {
    lines.push(translate('resourceManager.spaceScanReady', 'Space scan ready'))
  }

  if (args.sessionCount > 0 || args.browserCount > 0) {
    lines.push(
      translate(
        'resourceManager.tooltip.grouped',
        'Terminal sessions and browsers are grouped by workspace.'
      )
    )
  } else {
    lines.push(translate('resourceManager.tooltip.empty', 'No terminal sessions or browsers yet.'))
  }

  return lines
}

export function getResourceManagerAriaLabel(args: {
  sessionCount: number
  browserCount: number
  spaceScanReady: boolean
}): string {
  const parts = [
    translate('resourceManager.name', 'Resource Manager'),
    formatTerminalSessionCount(args.sessionCount),
    formatBrowserCount(args.browserCount)
  ]

  if (args.spaceScanReady) {
    parts.push(translate('resourceManager.spaceScanReady', 'Space scan ready'))
  }

  return parts.join(', ')
}
