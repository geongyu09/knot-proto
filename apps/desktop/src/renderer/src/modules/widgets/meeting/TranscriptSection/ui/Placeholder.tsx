import styles from './Placeholder.module.css'

interface PlaceholderProps {
  message: string
  isError?: boolean
}

/** 회의를 아직 못 그리는 상태(불러오는 중·없음·실패). 창 끌기는 GNB 줄이 맡는다 */
export default function Placeholder({ message, isError = false }: PlaceholderProps) {
  return <p className={isError ? styles.error : styles.message}>{message}</p>
}
