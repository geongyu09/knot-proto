import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'
import useRecorder from '@renderer/shared/hooks/domain/recording/useRecorder'

/**
 * 보이지 않는 녹음 호스트 창의 내용. 그리는 것 없이 오디오 그래프만 들고, 메인 창·메뉴바·전역 단축키의
 * 명령을 `recording:command`로 받아 녹음한다 (references/architecture.md "녹음 호스트 창 · 메뉴바 · 전역 단축키").
 */
export default function RecorderHostSection() {
  const { status } = useModelStatus()
  useRecorder({ isReady: status?.isReady ?? false })

  return null
}
