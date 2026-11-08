import { useEffect, useRef, useState } from 'react'
import { useToast } from './toast'
import type { Tour } from './tours'

interface Box {
  x: number
  y: number
  w: number
  h: number
}
const PAD = 10
const FADE = 700 // dissolvenza morbida (ms), uguale a quella di comparsa

/** Oscura tutto tranne un punto dell'app (lasciato toccabile) e mostra una breve spiegazione. */
export default function Spotlight({
  tour,
  text,
  open = true,
  onClose,
}: {
  tour: Tour
  text: string
  open?: boolean // false: si dissolve da sola
  onClose: () => void
}) {
  const toast = useToast()
  const [box, setBox] = useState<Box | null>(null)
  const [closing, setClosing] = useState(false)
  const el = useRef<Element | null>(null)
  const closeRef = useRef<() => void>(() => {})
  const close = () => {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, FADE)
  }
  closeRef.current = close
  useEffect(() => {
    if (!open) closeRef.current()
  }, [open])

  useEffect(() => {
    let raf = 0
    let alive = true
    const t0 = Date.now()
    let scrolled = false
    const tick = () => {
      if (!alive) return
      // una scheda aperta (es. "Nuovo prodotto") chiude la guida
      if (document.querySelector('.sheet-wrap')) return closeRef.current()
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
  // Testo al centro della pagina; se coprirebbe l'elemento evidenziato, si sposta subito sotto (o sopra).
  const mid = vh / 2
  const overlaps = y < mid + 55 && y + h > mid - 55
  const textStyle: React.CSSProperties = !overlaps
    ? { top: mid, transform: 'translateY(-50%)' }
    : y + h + 130 < vh
      ? { top: y + h + 24 }
      : { bottom: vh - y + 24 }
  return (
    <div className={'spot' + (closing ? ' out' : '')} role="dialog" aria-label="Guida">
      {/* oscuramento verde trasparente con un'apertura sfumata attorno all'elemento */}
      <svg className="spot-svg" width={vw} height={vh} aria-hidden="true">
        <defs>
          <filter id="spot-blur" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
          <mask id="spot-mask">
            <rect width={vw} height={vh} fill="#fff" />
            <rect x={x} y={y} width={w} height={h} rx="16" fill="#000" filter="url(#spot-blur)" />
          </mask>
        </defs>
        <rect width={vw} height={vh} fill="rgba(18, 74, 44, 0.95)" mask="url(#spot-mask)" />
      </svg>
      {/* zone che catturano il tocco (l'elemento evidenziato resta toccabile) */}
      <div className="spot-hit" style={{ left: 0, top: 0, width: '100%', height: y }} onClick={close} />
      <div className="spot-hit" style={{ left: 0, top: y + h, width: '100%', bottom: 0 }} onClick={close} />
      <div className="spot-hit" style={{ left: 0, top: y, width: x, height: h }} onClick={close} />
      <div className="spot-hit" style={{ left: x + w, top: y, right: 0, height: h }} onClick={close} />
      <p className="spot-text" style={textStyle}>
        {text}
      </p>
    </div>
  )
}
