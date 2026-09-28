import type { KeyboardEvent } from 'react'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type { SidebarTab } from '../types/sidebar'
import styles from './SidebarTabs.module.css'

const TAB_ORDER: SidebarTab[] = ['decisions', 'meetings']

interface SidebarTabsProps {
  tab: SidebarTab
  panelId: string
  onChange: (tab: SidebarTab) => void
}

/** [결정 문서 | 회의록]. ←/→로도 옮긴다 (WAI-ARIA 탭 패턴) */
export default function SidebarTabs({ tab, panelId, onChange }: SidebarTabsProps) {
  const { t } = useLocale()
  const labels: Record<SidebarTab, string> = {
    decisions: t.decisions.sidebar.decisionsTab,
    meetings: t.decisions.sidebar.meetingsTab
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    onChange(TAB_ORDER.find((candidate) => candidate !== tab) ?? tab)
  }

  return (
    <div
      className={styles.tabs}
      role="tablist"
      aria-label={t.decisions.sidebar.tabs}
      onKeyDown={handleKeyDown}
    >
      {TAB_ORDER.map((candidate) => (
        <button
          key={candidate}
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={candidate === tab}
          aria-controls={panelId}
          tabIndex={candidate === tab ? 0 : -1}
          onClick={() => onChange(candidate)}
        >
          {labels[candidate]}
        </button>
      ))}
    </div>
  )
}
