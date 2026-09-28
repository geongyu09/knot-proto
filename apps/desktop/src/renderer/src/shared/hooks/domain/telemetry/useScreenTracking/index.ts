import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { trackApi } from '@renderer/shared/api/telemetry'
import { screenNameOf } from '@renderer/shared/utils/screenName'

/** 메인 창의 화면 이동을 사용 정보로 남긴다 (references/telemetry.md "수집 항목") */
const useScreenTracking = () => {
  const { pathname } = useLocation()
  const screen = screenNameOf(pathname)

  useEffect(() => {
    trackApi({ name: 'screen_viewed', props: { screen } })
  }, [screen])

  return { screen }
}

export default useScreenTracking
