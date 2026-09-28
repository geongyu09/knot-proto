import type { KeyboardEvent } from 'react'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './SearchField.module.css'

interface SearchFieldProps {
  value: string
  /** 탭마다 찾는 대상이 달라 문구를 탭이 정한다 */
  placeholder: string
  onChange: (value: string) => void
}

/** Esc나 지우기 버튼으로 검색을 끝내면 원래 목록으로 돌아간다 */
export default function SearchField({ value, placeholder, onChange }: SearchFieldProps) {
  const { t } = useLocale()
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' || !value) return
    event.preventDefault()
    onChange('')
  }

  return (
    <label className={styles.field}>
      <Icon name="search" size={15} />
      <input
        className={styles.input}
        type="text"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
      />
      {value ? (
        <button
          type="button"
          className={styles.clear}
          aria-label={t.sidebar.search.clear}
          onClick={() => onChange('')}
        >
          <Icon name="close" size={13} />
        </button>
      ) : null}
    </label>
  )
}
