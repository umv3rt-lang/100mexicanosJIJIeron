'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { useGame } from './GameProvider'
import { playSound } from '../lib/sounds'
import './IntroSetupScreen.css'

/**
 * ✅ Objetivo:
 * - Intro (intro.mp3) en LOOP desde que carga la pantalla.
 * - Si el navegador bloquea autoplay, se habilita con el primer click/tap en cualquier parte.
 * - Al iniciar juego: detener intro y reproducir ajugar.mp3, luego START_MATCH.
 *
 * ✅ FIX: Si el juego ya empezó, esta pantalla NO debe volver a aparecer aunque state sea null (flicker socket).
 */
export default function IntroSetupScreen() {
  const { state, send, connected } = useGame()
  const [step, setStep] = useState<'SPLASH' | 'SETUP'>('SPLASH')

  const [teamA, setTeamA] = useState('Equipo 1')
  const [teamB, setTeamB] = useState('Equipo 2')
  const [roundsTotal, setRoundsTotal] = useState(10)

  // ✅ Para NO volver a mostrar Intro si ya empezó el match
  const everStartedRef = useRef(false)
  useEffect(() => {
    if (state && state.phase !== 'SETUP') everStartedRef.current = true
  }, [state?.phase, state])

  // === Audio intro control (loop) ===
  const introAudioRef = useRef<HTMLAudioElement | null>(null)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [introPlaying, setIntroPlaying] = useState(false)

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

  // ✅ Detener intro si YA no estamos en SETUP
  useEffect(() => {
    if (!state) {
      // si el juego ya empezó y state cae a null -> NO re-mostrar ni permitir audio de intro
      if (everStartedRef.current) stopIntro()
      return
    }
    if (state.phase !== 'SETUP') stopIntro()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state])

  // ✅ REGLA CLAVE:
  // - Si el juego YA empezó, JAMÁS mostrar Intro aunque state sea null
  if (everStartedRef.current) return null

  // si state existe y no es setup, tampoco mostramos intro
  if (state && state.phase !== 'SETUP') return null

  const canStart = useMemo(
    () => teamA.trim().length > 0 && teamB.trim().length > 0 && roundsTotal >= 1,
    [teamA, teamB, roundsTotal],
  )

  const goSetup = async () => {
    setStep('SETUP')
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

  const onStart = async () => {
    send({ type: 'SET_TEAMS', teamA: teamA.trim(), teamB: teamB.trim() } as any)
    send({ type: 'SET_ROUNDS_TOTAL', roundsTotal } as any)

    stopIntro()

    try {
      await playSound('ajugar', { restart: true })
    } catch {}

    send({ type: 'START_MATCH' } as any)
  }

  return (
    <div className="intro3d">
      <div className="intro3d__bg" aria-hidden />

      <div className="intro3d__stage">
        <div className="frame3d">
          <div className="chase chase--top" aria-hidden />
          <div className="chase chase--right" aria-hidden />
          <div className="chase chase--bottom" aria-hidden />
          <div className="chase chase--left" aria-hidden />

          <div className="screen">
            <header className="screen__top">
              <div className={`pill ${connected ? 'pill--ok' : 'pill--bad'}`}>
                {connected ? '🟢 Conectado' : '🔴 Conectando…'}
              </div>

              <div className="pill pill--ghost">
                {introPlaying ? '🔊 Intro sonando' : '🔇 Toca la pantalla para activar audio'}
              </div>
            </header>

            {step === 'SPLASH' ? (
              <main className="screen__main">
                <LogoLikeTV />

                <p className="screen__desc">
                  Estilo programa original: <b>taches por equipo</b>, <b>robo a 3</b> y tablero.
                </p>

                <div className="screen__cta">
                  <button className="btn btn--primary" onClick={goSetup} type="button">
                    ENTRAR AL JUEGO ▶
                  </button>

                  <button className="btn btn--ghost" onClick={replayIntro} type="button">
                    🔊 Reiniciar intro
                  </button>
                </div>

                <div className="screen__hint">Tip: pantalla completa para que se vea más 🔥</div>
              </main>
            ) : (
              <main className="screen__main screen__main--setup">
                <div className="setupHead">
                  <div className="setupHead__title">CONFIGURACIÓN</div>
                  <div className="setupHead__sub">Define nombres y rondas.</div>
                </div>

                <div className="form3d">
                  <div className="form3d__row">
                    <Field label="Equipo 1">
                      <input
                        value={teamA}
                        onChange={(e) => setTeamA(e.target.value)}
                        placeholder="Nombre del Equipo 1"
                      />
                    </Field>

                    <Field label="Equipo 2">
                      <input
                        value={teamB}
                        onChange={(e) => setTeamB(e.target.value)}
                        placeholder="Nombre del Equipo 2"
                      />
                    </Field>
                  </div>

                  <Field label="Rondas">
                    <select value={roundsTotal} onChange={(e) => setRoundsTotal(Number(e.target.value))}>
                      {[3, 5, 7, 10, 15, 20].map((n) => (
                        <option key={n} value={n}>
                          {n} rondas
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="form3d__actions">
                    <button className="btn btn--primary" onClick={onStart} disabled={!canStart || !connected} type="button">
                      INICIAR: {teamA} vs {teamB}
                    </button>

                    <button className="btn btn--ghost" onClick={() => setStep('SPLASH')} type="button">
                      ⬅ Volver
                    </button>
                  </div>
                </div>
              </main>
            )}

            <footer className="screen__footer">“¡Dijeron!” · “Survey says!” · 🎤</footer>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <div className="field__control">{children}</div>
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
