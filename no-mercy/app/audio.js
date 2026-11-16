import { useEffect, useRef } from 'react'

export function useAudio(music, effects, notice) {
  const context = useRef(null)
  function tone(frequency, duration, volume, type = 'sine') {
    const ctx = context.current
    if (!ctx || ctx.state !== 'running') return
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = type
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + duration)
  }
  useEffect(() => {
    if (effects && notice) tone(440, 0.15, 0.065, 'triangle')
  }, [notice, effects])
  useEffect(() => {
    if (!music) return
    const notes = [110, 0, 130.81, 146.83, 110, 164.81, 146.83, 0]
    let beat = 0
    const tick = () => {
      const frequency = notes[beat++ % notes.length]
      if (frequency) tone(frequency, 0.48, 0.075, 'triangle')
    }
    tick()
    const interval = setInterval(tick, 310)
    return () => clearInterval(interval)
  }, [music])
  useEffect(() => () => { context.current?.close(); context.current = null }, [])
  return () => {
    if (!window.AudioContext) return
    context.current ??= new AudioContext()
    context.current.resume().catch(() => {})
  }
}

