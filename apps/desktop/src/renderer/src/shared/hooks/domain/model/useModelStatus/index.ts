import { useCallback, useEffect, useState } from 'react'
import type { ModelDownloadProgressEvent, ModelStatusResponse } from '@shared/ipc'
import type { ModelKey, WhisperModelId } from '@shared/types'
import { onModelDownloadProgress, onModelsChanged } from '@renderer/shared/api/events'
import {
  downloadModelsApi,
  downloadSummaryModelApi,
  getModelStatusApi
} from '@renderer/shared/api/models'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

type DownloadProgressMap = Partial<Record<ModelKey, ModelDownloadProgressEvent>>

const useModelStatus = () => {
  const { t } = useLocale()
  const [status, setStatus] = useState<ModelStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [progress, setProgress] = useState<DownloadProgressMap>({})
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<Error | null>(null)

  // effect에서 부르는 함수라 await 대신 프로미스 체인으로 쓴다 (.claude/rules/hook-guide.md)
  const fetchStatus = useCallback(
    () =>
      getModelStatusApi()
        .then((next) => {
          setStatus(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error(t.models.status.loadError))
        )
        .finally(() => setIsLoading(false)),
    [t]
  )

  const refetch = useCallback(() => {
    setIsLoading(true)

    return fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // 다른 창이 받은 모델도 반영한다. 녹음 호스트 창은 언마운트되지 않아 마운트 때 읽은 값만으로는 부족하다
  useEffect(() => onModelsChanged(fetchStatus), [fetchStatus])

  useEffect(
    () =>
      onModelDownloadProgress((event) => {
        setProgress((previous) => ({ ...previous, [event.key]: event }))
      }),
    []
  )

  /** 다운로드 응답이 곧 최신 상태라 끝난 뒤 다시 조회하지 않는다 */
  const runDownload = async (request: () => Promise<ModelStatusResponse>) => {
    setIsDownloading(true)
    setDownloadError(null)
    setProgress({})

    try {
      setStatus(await request())

      return true
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught : new Error(t.models.status.downloadError))

      return false
    } finally {
      setIsDownloading(false)
    }
  }

  const downloadModels = ({ whisperModelId }: { whisperModelId: WhisperModelId }) =>
    runDownload(() => downloadModelsApi({ whisperModelId }))

  const downloadSummaryModel = () => runDownload(downloadSummaryModelApi)

  return {
    status,
    isLoading,
    error,
    refetch,
    progress,
    isDownloading,
    downloadError,
    downloadModels,
    downloadSummaryModel
  }
}

export default useModelStatus
