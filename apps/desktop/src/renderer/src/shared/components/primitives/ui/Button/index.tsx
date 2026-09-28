import type { ButtonHTMLAttributes } from 'react'

import styles from './index.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'
export type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 색 버튼은 없다(knot). 빨강(`danger`)은 삭제 확인에만 쓴다 */
  variant?: ButtonVariant
  size?: ButtonSize
}

export default function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[styles.button, styles[variant], styles[size], className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  )
}
