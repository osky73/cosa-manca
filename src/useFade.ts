import { useEffect, useState } from 'react'

const FADE_MS = 10000

/** Sfuma l'opacità da 1 a `target` in 10 secondi a partire da `from` (ms). Senza `from` torna a 1. */
export function useFade(from: number | undefined, target: number): { opacity: number; transition: string } {
  const [f, setF] = useState<{ o: number; ms: number }>({ o: 1, ms: 250 })
  useEffect(() => {
    if (from === undefined) {
      setF({ o: 1, ms: 250 })
      return
    }
    const left = FADE_MS - (Date.now() - from)
    if (left <= 0) {
      setF({ o: target, ms: 0 })
      return
    }
    setF({ o: 1 - ((1 - target) * (FADE_MS - left)) / FADE_MS, ms: 0 })
    const t = window.setTimeout(() => setF({ o: target, ms: left }), 30)
    return () => window.clearTimeout(t)
  }, [from, target])
  return { opacity: f.o, transition: f.ms ? `opacity ${f.ms}ms linear` : 'none' }
}
