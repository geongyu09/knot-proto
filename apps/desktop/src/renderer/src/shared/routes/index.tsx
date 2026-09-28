import { createHashRouter } from 'react-router'
import DecisionDetail from '@renderer/pages/DecisionDetail'
import Home from '@renderer/pages/Home'
import MeetingDetail from '@renderer/pages/MeetingDetail'
import Meetings from '@renderer/pages/Meetings'
import Onboarding from '@renderer/pages/Onboarding'
import Record from '@renderer/pages/Record'
import RecorderHost from '@renderer/pages/RecorderHost'
import Settings from '@renderer/pages/Settings'

import { RequireModels } from './guards'
import { AppShellLayout, MainWindowLayout } from './layout'
import { PATHS } from './paths'

/** file://에서도 동작해야 하므로 해시 라우터를 쓴다 (references/architecture.md) */
export const router = createHashRouter([
  // 녹음 호스트 창은 모델 가드 밖에 둔다. 가드 안에 두면 모델이 없을 때 온보딩이 마운트돼 녹음 훅이 돌지 않는다
  { path: PATHS.recorder, element: <RecorderHost /> },
  { path: PATHS.onboarding, element: <Onboarding /> },
  {
    element: <MainWindowLayout />,
    children: [
      {
        // 경로 없는 레이아웃 라우트. 필수 모델이 없으면 자식 대신 온보딩으로 보낸다
        element: <RequireModels />,
        children: [
          {
            element: <AppShellLayout />,
            children: [
              { path: PATHS.home, element: <Home /> },
              { path: PATHS.meetings, element: <Meetings /> },
              { path: PATHS.record, element: <Record /> },
              { path: PATHS.meetingDetail, element: <MeetingDetail /> },
              { path: PATHS.decisionDetail, element: <DecisionDetail /> },
              { path: PATHS.settings, element: <Settings /> }
            ]
          }
        ]
      }
    ]
  }
])
