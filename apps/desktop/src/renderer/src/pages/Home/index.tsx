import ImportAudioCard from '@renderer/modules/widgets/meeting/ImportAudioCard'
import RecentMeetingsCard from '@renderer/modules/widgets/meeting/RecentMeetingsCard'
import WeeklyStatsCard from '@renderer/modules/widgets/meeting/WeeklyStatsCard'
import CurrentRecordingCard from '@renderer/modules/widgets/recording/CurrentRecordingCard'
import PageColumn from '@renderer/shared/components/primitives/layout/PageColumn'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

/** 인사 + 카드 2×2 (knot "홈/기본", references/architecture.md "화면별 구성" > 홈) */
export default function Home() {
  const { t } = useLocale()

  return (
    <PageColumn>
      <h1 className={styles.greeting}>{t.sidebar.home.greeting}</h1>
      <div className={styles.grid}>
        <RecentMeetingsCard />
        <WeeklyStatsCard />
        <CurrentRecordingCard />
        <ImportAudioCard />
      </div>
    </PageColumn>
  )
}
