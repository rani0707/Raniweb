'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { lockScroll } from '@/lib/scroll-lock'
import styles from './Modal.module.css'

interface ModalProps { children: React.ReactNode; onClose: () => void; title: string }

export default function Modal({ children, onClose, title }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    const unlock = lockScroll()
    return () => {
      dialog.close()
      unlock()
      previous?.focus()
    }
  }, [])
  if (typeof document === 'undefined') return null
  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === dialogRef.current) onClose() }}
    >
      <span id={titleId} className={styles.srOnly}>{title}</span>
      {children}
    </dialog>,
    document.body,
  )
}
