"use client"

import { useEffect } from "react"

const SIZE = 128
const CYCLE_MS = 7000
const FPS = 24
const LETTERS = "COASTY"
const LETTER_PER = 0.17 // each letter's full lifetime as fraction of cycle (~1.19s)
const LETTER_STAGGER = 0.085 // delay between letter starts (~0.6s) — ~50% overlap
const PARADE_END = LETTER_STAGGER * (LETTERS.length - 1) + LETTER_PER // ~0.595

const easeIn = (t: number) => t * t * t
const easeInOut = (t: number) => t * t * (3 - 2 * t)
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5)

export function AnimatedFavicon() {
  useEffect(() => {
    if (typeof window === "undefined") return

    const canvas = document.createElement("canvas")
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const links = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')
    )
    if (links.length === 0) {
      const l = document.createElement("link")
      l.rel = "icon"
      document.head.appendChild(l)
      links.push(l)
    }
    links.forEach((l) => (l.type = "image/png"))

    const cx = SIZE / 2
    const cy = SIZE / 2
    const orbR = SIZE * (160 / 512)
    const cornerR = SIZE * (108 / 512)

    const drawRoundedRect = (r: number) => {
      ctx.beginPath()
      ctx.moveTo(r, 0)
      ctx.lineTo(SIZE - r, 0)
      ctx.quadraticCurveTo(SIZE, 0, SIZE, r)
      ctx.lineTo(SIZE, SIZE - r)
      ctx.quadraticCurveTo(SIZE, SIZE, SIZE - r, SIZE)
      ctx.lineTo(r, SIZE)
      ctx.quadraticCurveTo(0, SIZE, 0, SIZE - r)
      ctx.lineTo(0, r)
      ctx.quadraticCurveTo(0, 0, r, 0)
      ctx.closePath()
    }

    const bgGrad = ctx.createLinearGradient(0, 0, SIZE, SIZE)
    bgGrad.addColorStop(0, "#0a0a0a")
    bgGrad.addColorStop(1, "#171717")

    const drawOrb = (scale: number, glow: number, alpha = 1) => {
      const r = Math.max(0.5, orbR * scale)
      ctx.save()
      ctx.globalAlpha = alpha

      if (glow > 0.01) {
        const bloomR = r * (1.4 + glow * 1.8)
        const bloom = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, bloomR)
        bloom.addColorStop(0, `rgba(255,255,255,${0.55 * glow})`)
        bloom.addColorStop(0.4, `rgba(255,255,255,${0.18 * glow})`)
        bloom.addColorStop(1, "rgba(255,255,255,0)")
        ctx.fillStyle = bloom
        ctx.beginPath()
        ctx.arc(cx, cy, bloomR, 0, Math.PI * 2)
        ctx.fill()
      }

      const lift = glow * 0.35
      const orbGrad = ctx.createLinearGradient(cx, cy - r, cx, cy + r)
      orbGrad.addColorStop(0, `rgba(255,255,255,${lift * 0.3})`)
      orbGrad.addColorStop(0.25, `rgba(255,255,255,${0.06 + lift * 0.4})`)
      orbGrad.addColorStop(0.45, `rgba(255,255,255,${0.18 + lift * 0.4})`)
      orbGrad.addColorStop(0.6, `rgba(255,255,255,${0.4 + lift * 0.3})`)
      orbGrad.addColorStop(0.8, `rgba(255,255,255,${0.75 + lift * 0.2})`)
      orbGrad.addColorStop(1, "rgba(255,255,255,1)")
      ctx.fillStyle = orbGrad
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = `rgba(255,255,255,${0.18 + 0.7 * glow})`
      ctx.lineWidth = 1 + glow * 1.4
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()

      ctx.restore()
    }

    const drawLetter = (char: string, x: number, alpha: number) => {
      ctx.save()
      ctx.font = `200 ${SIZE * 0.82}px "Instrument Serif", "Times New Roman", Georgia, serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      // Soft cinematic glow halo
      ctx.shadowColor = `rgba(255,255,255,${0.55 * alpha})`
      ctx.shadowBlur = SIZE * 0.18
      ctx.fillStyle = `rgba(255,255,255,${alpha})`
      ctx.fillText(char, x, cy + SIZE * 0.02)
      ctx.shadowBlur = 0
      ctx.restore()
    }

    const drawVignette = () => {
      ctx.save()
      drawRoundedRect(cornerR)
      ctx.clip()
      const v = ctx.createRadialGradient(cx, cy, SIZE * 0.25, cx, cy, SIZE * 0.72)
      v.addColorStop(0, "rgba(0,0,0,0)")
      v.addColorStop(1, "rgba(0,0,0,0.35)")
      ctx.fillStyle = v
      ctx.fillRect(0, 0, SIZE, SIZE)
      ctx.restore()
    }

    let raf = 0
    let lastDraw = 0
    const frameInterval = 1000 / FPS
    const start = performance.now()

    const render = (now: number) => {
      raf = requestAnimationFrame(render)
      if (now - lastDraw < frameInterval) return
      lastDraw = now
      if (document.hidden) return

      const t = ((now - start) % CYCLE_MS) / CYCLE_MS

      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.fillStyle = bgGrad
      drawRoundedRect(cornerR)
      ctx.fill()
      ctx.strokeStyle = "rgba(255,255,255,0.07)"
      ctx.lineWidth = 1
      drawRoundedRect(cornerR)
      ctx.stroke()

      // Cinematic timeline (7s):
      // 0.000–0.595  COASTY letters parade — each enters from right, holds, exits left
      // 0.595–0.700  bright nucleus slowly blooms at center
      // 0.700–0.800  orb fades up from the nucleus (no scale-pop, just dissolve)
      // 0.800–0.950  glow swells on a long bell curve, then settles
      // 0.950–1.000  ambient hold before loop
      if (t < PARADE_END) {
        for (let i = 0; i < LETTERS.length; i++) {
          const lstart = i * LETTER_STAGGER
          const lend = lstart + LETTER_PER
          if (t < lstart || t >= lend) continue
          const lp = (t - lstart) / LETTER_PER

          let x: number
          let alpha: number
          if (lp < 0.35) {
            // glide in from off-right with quintic deceleration
            const p = easeOutQuint(lp / 0.35)
            x = SIZE * 1.3 + (cx - SIZE * 1.3) * p
            alpha = easeInOut(lp / 0.35)
          } else if (lp < 0.62) {
            // hold at center, fully present
            x = cx
            alpha = 1
          } else {
            // drift out to the left, accelerating
            const p = easeIn((lp - 0.62) / 0.38)
            x = cx + (-SIZE * 0.3 - cx) * p
            alpha = 1 - easeInOut((lp - 0.62) / 0.38)
          }
          drawLetter(LETTERS[i], x, alpha)
        }
      } else if (t < 0.70) {
        const p = easeInOut((t - PARADE_END) / (0.70 - PARADE_END))
        const nR = orbR * (0.4 + 0.7 * p)
        const nucleus = ctx.createRadialGradient(cx, cy, 0, cx, cy, nR)
        nucleus.addColorStop(0, `rgba(255,255,255,${Math.min(1, 0.85 * p)})`)
        nucleus.addColorStop(0.4, `rgba(255,255,255,${0.35 * p})`)
        nucleus.addColorStop(1, "rgba(255,255,255,0)")
        ctx.fillStyle = nucleus
        ctx.beginPath()
        ctx.arc(cx, cy, nR, 0, Math.PI * 2)
        ctx.fill()
      } else if (t < 0.80) {
        const p = easeInOut((t - 0.70) / 0.10)
        // Orb dissolves in at full size — cinematic, no cartoony scale-up
        drawOrb(1, 0.4 + 0.4 * (1 - p), p)
      } else if (t < 0.95) {
        const p = (t - 0.80) / 0.15
        const pulse = Math.exp(-Math.pow((p - 0.30) / 0.28, 2)) * 0.75
        const glow = pulse + 0.08
        drawOrb(1, glow)
      } else {
        drawOrb(1, 0.08)
      }

      drawVignette()

      const url = canvas.toDataURL("image/png")
      links.forEach((l) => (l.href = url))
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [])

  return null
}
