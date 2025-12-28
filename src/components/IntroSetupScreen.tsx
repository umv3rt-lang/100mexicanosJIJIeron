'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGame } from './GameProvider'
import { playSound } from '../lib/sounds'
import './IntroSetupScreen.css'

/**
 * ✅ Objetivo NUEVO (PRO):
 * - Esta pantalla es SOLO “pantalla/tablero”.
 * - NO deja editar nombres ni rondas (eso SOLO lo hace el conductor en /conductor).
 * - Intro (intro.mp3) en loop mientras phase === 'SETUP'.
 * - Cuando el conductor inicia (phase cambia a PLAYING), se detiene intro y suena "ajugar".
 * - Botón “CONDUCTOR” para ir a /conductor.
 *
 * ✅ FIX flicker:
 * si el juego ya empezó, esta pantalla NO vuelve a aparecer aunque state sea null.
 */
export default function IntroSetupScreen() {
  const router = useRouter()
  const { state, connected } = useGame()

  // ✅ Para NO volver a mostrar Intro si ya empezó el match
  const everStartedRef = useRef(false)
  useEffect(() => {
    if (state && state.phase !== 'SETUP') everStartedRef.current = true
  }, [state?.phase, state])

  // === Audio intro control (loop) ===
  const introAudioRef = useRef<HTMLAudioElement | null>(null)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [introPlaying, setIntroPlaying] = useState(false)

  // ✅ para no repetir "ajugar"
  const playedAjugarRef = useRef(false)

  // init intro audio once
  useEffect(() => {
    if (introAudioRef.current) return

    const a = new Audio('/intro.mp3')
    a.preload = 'auto'
    a.loop = true
    a.volume = 1
    introAudioRef.current = a

    return () => {
      try {
        a.pause()
        a.currentTime = 0
      } catch {}
      introAudioRef.current = null
    }
  }, [])

  // try autoplay intro on mount
  useEffect(() => {
    const a = introAudioRef.current
    if (!a) return

    ;(async () => {
      try {
        await a.play()
        setIntroPlaying(true)
        setAudioUnlocked(true)
      } catch {
        setIntroPlaying(false)
      }
    })()
  }, [])

  // unlock audio on first user interaction anywhere
  useEffect(() => {
    if (audioUnlocked) return

    const unlock = async () => {
      const a = introAudioRef.current
      if (!a) return
      try {
        await a.play()
        setIntroPlaying(true)
        setAudioUnlocked(true)
      } catch {}
    }

    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    return () => {
      window.removeEventListener('pointerdown', unlock as any)
      window.removeEventListener('keydown', unlock as any)
    }
  }, [audioUnlocked])

  const stopIntro = () => {
    const a = introAudioRef.current
    if (!a) return
    try {
      a.pause()
      a.currentTime = 0
    } catch {}
    setIntroPlaying(false)
  }

  const replayIntro = async () => {
    const a = introAudioRef.current
    if (!a) return
    try {
      a.currentTime = 0
      await a.play()
      setIntroPlaying(true)
      setAudioUnlocked(true)
    } catch {}
  }

  // ✅ Control de audio por fase:
  // - SETUP: intro loop
  // - PLAYING/otro: stop intro + play ajugar 1 vez
  useEffect(() => {
    if (!state) {
      if (everStartedRef.current) stopIntro()
      return
    }

    if (state.phase === 'SETUP') {
      // si regresara a setup (reset), permite intro otra vez
      playedAjugarRef.current = false
      return
    }

    // ya empezó el match
    stopIntro()

    if (!playedAjugarRef.current) {
      playedAjugarRef.current = true
      void playSound('ajugar', { restart: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state])

  // ✅ REGLA CLAVE:
  // - Si el juego YA empezó, JAMÁS mostrar Intro aunque state sea null
  if (everStartedRef.current) return null
  if (state && state.phase !== 'SETUP') return null

  const teamA = state?.teams?.A?.name || 'Equipo 1'
  const teamB = state?.teams?.B?.name || 'Equipo 2'
  const roundsTotal = state?.roundsTotal ?? 10

  const statusText = useMemo(() => {
    if (!connected) return 'Conectando al servidor…'
    return 'Listo. Esperando al conductor.'
  }, [connected])

  return (
    <div className="intro3d introPro">
      <div className="intro3d__bg" aria-hidden />

      <div className="intro3d__stage">
        <div className="frame3d">
          <div className="screen introPro__screen">
            <header className="screen__top">
              <div className={`pill ${connected ? 'pill--ok' : 'pill--bad'}`}>
                {connected ? '🟢 Conectado' : '🔴 Conectando…'}
              </div>

              <div className="pill pill--ghost">
                {introPlaying ? '🔊 Intro sonando' : '🔇 Toca la pantalla para activar audio'}
              </div>
            </header>

            <main className="screen__main introPro__main">
              <LogoLikeTV />

              <div className="introPro__status">{statusText}</div>

              <div className="introPro__info">
                <div className="introPro__row">
                  <span className="introPro__label">Equipos</span>
                  <span className="introPro__value">
                    <b>{teamA}</b> vs <b>{teamB}</b>
                  </span>
                </div>

                <div className="introPro__row">
                  <span className="introPro__label">Rondas</span>
                  <span className="introPro__value">
                    <b>{roundsTotal}</b>
                  </span>
                </div>
              </div>

              <div className="introPro__cta">
                <button className="btn btn--primary" onClick={() => router.push('/conductor')} type="button">
                  🎛️ CONDUCTOR
                </button>

                <button className="btn btn--ghost" onClick={replayIntro} type="button">
                  🔊 Reiniciar intro
                </button>
              </div>

              <div className="introPro__hint">* La configuración e inicio del juego se hace desde Conductor.</div>
            </main>

            <footer className="screen__footer introPro__footer">🎤</footer>
          </div>
        </div>
      </div>
    </div>
  )
}

function LogoLikeTV() {
  return (
    <div className="logoTV">
      <img
        className="logoTV__img"
        src="/intro/logo.png"
        alt="100 Mexicanos Dijeron"
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          const fb = document.getElementById('logoTV-fallback')
          if (fb) fb.style.display = 'block'
        }}
      />
      <div id="logoTV-fallback" className="logoTV__fallback">
        <div className="logoTV__line logoTV__line--a">100</div>
        <div className="logoTV__line">MEXICANOS</div>
        <div className="logoTV__line">DIJERON</div>
      </div>
    </div>
  )
}
