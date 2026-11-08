import { useEffect, useRef, useState } from 'react'
import { useToast } from './toast'
import type { Tour } from './tours'

interface Box {
  x: number
  y: number
  w: number
  h: number
}
const PAD = 6

/** Oscura tutto tranne un punto dell'app (lasciato toccabile) e mostra una breve spiegazione. */
export default function Spotlight({ tour, text, onClose }: { tour: Tour; text: string; onClose: () => void }) {
  const toast = useToast()
  const [box, setBox] = useState<Box | null>(null)
  const el = useRef<Element | null>(null)

  useEffect(() => {
    let raf = 0
    let alive = true
    const t0 = Date.now()
    let scrolled = false
    const tick = () => {
      if (!alive) return
      // una scheda aperta (es. "Nuovo prodotto") chiude la guida
      if (document.querySelector('.sheet-wrap')) return onClose()
      const found = document.querySelector(tour.selector)
      if (found) {
        el.current = found
        if (!scrolled) {
          scrolled = true
          found.scrollIntoView({ block: tour.scroll === 'end' ? 'center' : 'center', behavior: 'smooth' })
        }
        const r = found.getBoundingClientRect()
        setBox((b) =>
          b && Math.abs(b.x - r.left) < 0.5 && Math.abs(b.y - r.top) < 0.5 && Math.abs(b.w - r.width) < 0.5
            ? b
            : { x: r.left, y: r.top, w: r.width, h: r.height },
        )
      } else if (Date.now() - t0 > 3000) {
        toast.show('Non trovo il punto da mostrarti')
        return onClose()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id])

  if (!box) return null
  const vw = window.innerWidth
  const vh = window.innerHeight
  const x = Math.max(0, box.x - PAD)
  const y = Math.max(0, box.y - PAD)
  const w = Math.min(vw - x, box.w + PAD * 2)
  const h = box.h + PAD * 2
  const below = y + h + 150 < vh
  return (
    <div className="spot" role="dialog" aria-label="Guida">
      <div className="spot-dim" style={{ left: 0, top: 0, width: '100%', height: y }} onClick={onClose} />
      <div className="spot-dim" style={{ left: 0, top: y + h, width: '100%', bottom: 0 }} onClick={onClose} />
      <div className="spot-dim" style={{ left: 0, top: y, width: x, height: h }} onClick={onClose} />
      <div className="spot-dim" style={{ left: x + w, top: y, right: 0, height: h }} onClick={onClose} />
      <div className="spot-ring" style={{ left: x, top: y, width: w, height: h }} />
      <div className="spot-tip" style={below ? { top: y + h + 14 } : { bottom: vh - y + 14 }}>
        <p>{text}</p>
        <button className="btn slim" onClick={onClose}>
          Ho capito
        </button>
      </div>
    </div>
  )
}
