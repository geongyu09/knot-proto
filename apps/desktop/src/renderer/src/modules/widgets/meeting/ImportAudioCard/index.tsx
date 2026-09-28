import ImportAudioButton from '@renderer/modules/features/meeting/ImportAudioButton'
import Card from '@renderer/shared/components/primitives/layout/Card'
import Icon from '@renderer/shared/components/primitives/ui/Icon'

import styles from './index.module.css'

/**
 * 홈 오른쪽 아래 "녹음 파일 가져오기" (knot 팀원 초대 카드 자리).
 * 제목은 가져오기 행이 이미 가지고 있어 카드 헤더를 두지 않는다
 */
export default function ImportAudioCard() {
  return (
    <Card className={styles.card}>
      <span className={styles.iconTile} aria-hidden="true">
        <Icon name="upload" size={22} />
      </span>
      <div className={styles.row}>
        <ImportAudioButton />
      </div>
    </Card>
  )
}
