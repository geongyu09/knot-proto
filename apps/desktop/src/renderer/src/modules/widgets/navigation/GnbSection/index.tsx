import { NavLink, useMatch } from 'react-router'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

interface GnbSectionProps {
  isListOpen: boolean
  onToggleList: () => void
}

const tabClassName = ({ isActive }: { isActive: boolean }) =>
  [styles.tab, isActive ? styles.activeTab : ''].join(' ')

/**
 * 창 위에 떠 있는 GNB (knot GNB/Floating). 줄 전체가 창을 끄는 영역이고 버튼만 클릭을 받는다
 * (references/architecture.md "메인 창 레이아웃").
 */
export default function GnbSection({ isListOpen, onToggleList }: GnbSectionProps) {
  const { t } = useLocale()
  // 상세 화면도 회의록 탭 아래에 있다
  const isMeetingDetail = useMatch(PATHS.meetingDetail) !== null

  return (
    <header className={styles.gnb}>
      <div className={styles.side}>
        <button
          type="button"
          className={[styles.roundButton, isListOpen ? styles.pressed : ''].join(' ')}
          aria-label={isListOpen ? t.sidebar.gnb.closeList : t.sidebar.gnb.openList}
          aria-expanded={isListOpen}
          onClick={onToggleList}
        >
          <Icon name="list" size={18} />
        </button>
      </div>
      <nav className={styles.pill} aria-label={t.sidebar.gnb.tabs}>
        <NavLink to={PATHS.home} end className={tabClassName}>
          {t.sidebar.gnb.home}
        </NavLink>
        <NavLink
          to={PATHS.meetings}
          className={({ isActive }) => tabClassName({ isActive: isActive || isMeetingDetail })}
        >
          {t.sidebar.gnb.meetings}
        </NavLink>
      </nav>
      <div className={[styles.side, styles.right].join(' ')}>
        <NavLink
          to={PATHS.settings}
          className={({ isActive }) =>
            [styles.roundButton, isActive ? styles.pressed : ''].join(' ')
          }
          aria-label={t.sidebar.gnb.settings}
        >
          <Icon name="settings" size={18} />
        </NavLink>
      </div>
    </header>
  )
}
