/** Compatible with browsers without AbortSignal.any()/timeout(). */
export function createTimedAbort(timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => clearTimeout(timer),
    abort: () => { clearTimeout(timer); controller.abort() },
  }
}
