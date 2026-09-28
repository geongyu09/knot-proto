import AutoRefineToggle from '@renderer/modules/features/refine/AutoRefineToggle'
import ModelDownloadSection from '@renderer/modules/widgets/model/ModelDownloadSection'
import SummaryModelSection from '@renderer/modules/widgets/model/SummaryModelSection'
import GlossarySection from '@renderer/modules/widgets/setting/GlossarySection'
import LlmSection from '@renderer/modules/widgets/setting/LlmSection'
import SettingsSection from '@renderer/modules/widgets/setting/SettingsSection'
import PageToc from '@renderer/shared/components/composites/PageToc'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

export default function Settings() {
  const { t } = useLocale()

  return (
    <PageToc label={t.settings.toc}>
      <div className={styles.page}>
        <h1 className={styles.title}>{t.settings.title}</h1>
        <SettingsSection>
          <SettingGroup title={t.settings.groups.sttModel}>
            <ModelDownloadSection variant="setting" />
          </SettingGroup>
          {/* widgets는 widgets를 import하지 않으므로 로컬 모델 파일 행은 페이지가 슬롯으로 넘긴다 */}
          <LlmSection
            localModelSlot={<SummaryModelSection />}
            externalSlot={<AutoRefineToggle />}
          />
          <GlossarySection />
        </SettingsSection>
      </div>
    </PageToc>
  )
}
