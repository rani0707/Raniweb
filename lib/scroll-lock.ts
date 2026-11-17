let locks = 0
export function lockScroll() {
  if (++locks === 1) document.body.classList.add('scroll-locked')
  let released = false
  return () => {
    if (released) return
    released = true
    if (--locks === 0) document.body.classList.remove('scroll-locked')
  }
}
