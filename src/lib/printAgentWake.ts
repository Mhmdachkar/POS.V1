/** Best-effort nudge to local print agent (non-blocking). */
export function wakeLocalPrintAgent(port = 9277): void {
  const url = `http://127.0.0.1:${port}/wake`
  void fetch(url, { method: 'POST', mode: 'no-cors' }).catch(() => {
    /* agent optional */
  })
}
