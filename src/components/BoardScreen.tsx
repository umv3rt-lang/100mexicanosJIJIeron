'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useGame } from './GameProvider'
import { playSound } from '../lib/sounds'
import styles from './BoardScreen.module.css'

type Fly = {
  id: number
  team: 'A' | 'B'
  toX: number
  toY: number
  go: boolean
}

type ConfettiPiece = {
  id: number
  left: number
  delay: number
  dur: number
  size: number
  rot: number
  drift: number
  hue: number
}

type Balloon = {
  id: number
  left: number
  delay: number
  dur: number
  size: number
  hue: number
}

const FALLBACK_INCORRECTO_MS = 1200
const FLY_TRAVEL_MS = 760
const FLY_CLEANUP_EXTRA_MS = 120

const CONFETTI_COUNT = 120
const BALLOON_COUNT = 10

export default function BoardScreen() {
  const { state } = useGame()

  // ✅ Cache del último state/current válido para evitar “brinco” por flicker del socket
  const lastStateRef = useRef<any>(null)
  const lastCurrentRef = useRef<any>(null)

  useEffect(() => {
    if (state) {
      lastStateRef.current = state
      if (state.current) lastCurrentRef.current = state.current
    }
  }, [state])

  const stableState = state ?? lastStateRef.current
  const stableCurrent = stableState?.current ?? lastCurrentRef.current

  // refs siempre
  const prevA = useRef(0)
  const prevB = useRef(0)
  const prevRevealed = useRef(0)

  // para evitar repetir sonidos
  const prevFinished = useRef(false)
  const prevFinishedRound = useRef<number | null>(null)

  // ✅ sonido al cambiar de ronda
  const prevRoundRef = useRef<number | null>(null)

  // slots X (3 por equipo)
  const strikeSlotsA = useRef<Array<HTMLDivElement | null>>([])
  const strikeSlotsB = useRef<Array<HTMLDivElement | null>>([])

  // animación X voladora
  const flyId = useRef(0)
  const [fly, setFly] = useState<Fly | null>(null)

  // confetti / globos (solo se generan 1 vez al entrar a FINISHED por ronda)
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([])
  const [balloons, setBalloons] = useState<Balloon[]>([])
  const prevCelebrateKey = useRef<string>('')

  // ✅ para efecto “destapar” (dispara animación cuando un idx pasa a revealed)
  const revealedVersionRef = useRef(0)

  const current = stableCurrent
  const answersRaw = current?.answers ?? []

  // ✅ evita mostrar respuestas vacías
  const answers = useMemo(() => {
    return (answersRaw ?? []).filter((a: any) => (a?.text ?? '').trim().length > 0)
  }, [answersRaw])

  const revealedCount = useMemo(() => answers.filter((a: any) => a.revealed).length, [answers])

  // helper: playSound devuelve ms; si no, usamos fallback
  const playSoundMs = async (key: Parameters<typeof playSound>[0], fallbackMs: number) => {
    try {
      const ms = await playSound(key)
      if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) return ms
    } catch {}
    return fallbackMs
  }

  // ✅ sonido reveal + version para animación destape
  useEffect(() => {
    if (!stableState) return
    if (revealedCount > prevRevealed.current) {
      void playSound('correcto')
      revealedVersionRef.current += 1
    }
    prevRevealed.current = revealedCount
  }, [revealedCount, stableState])

  // ✅ SONIDO "RONDA" cada vez que cambia la ronda
  useEffect(() => {
    if (!stableState) return
    const r = stableState.round

    if (prevRoundRef.current === null) {
      prevRoundRef.current = r
      return
    }

    if (r !== prevRoundRef.current) {
      prevRoundRef.current = r
      void playSound('ronda', { restart: true })
      // resetea contador de reveal “previo” para no “animar raro” si cambia el array
      prevRevealed.current = 0
      revealedVersionRef.current += 1
    }
  }, [stableState?.round, stableState])

  // ✅ X: aparece al centro el MISMO tiempo que "incorrecto" y luego vuela al equipo
  useEffect(() => {
    if (!stableState) return

    const aNow = stableState.teams.A.strikes
    const bNow = stableState.teams.B.strikes
    const aPrev = prevA.current
    const bPrev = prevB.current

    const launchX = async (team: 'A' | 'B', newIndex: number) => {
      const slot = team === 'A' ? strikeSlotsA.current[newIndex] : strikeSlotsB.current[newIndex]
      if (!slot) return

      const r = slot.getBoundingClientRect()
      const toX = r.left + r.width / 2
      const toY = r.top + r.height / 2

      flyId.current += 1
      const id = flyId.current

      // 1) aparece al centro
      setFly({ id, team, toX, toY, go: false })

      // 2) suena incorrecto y medimos duración
      const incorrectoMs = await playSoundMs('incorrecto', FALLBACK_INCORRECTO_MS)

      // 3) cuando termina el sonido, vuela al slot
      window.setTimeout(() => {
        setFly((f) => (f && f.id === id ? { ...f, go: true } : f))
      }, incorrectoMs)

      // 4) cleanup después de volar
      window.setTimeout(() => {
        setFly((f) => (f && f.id === id ? null : f))
      }, incorrectoMs + FLY_TRAVEL_MS + FLY_CLEANUP_EXTRA_MS)
    }

    if (aNow > aPrev) {
      const idx = Math.min(2, aNow - 1)
      void launchX('A', idx)
    }
    if (bNow > bPrev) {
      const idx = Math.min(2, bNow - 1)
      void launchX('B', idx)
    }

    prevA.current = aNow
    prevB.current = bNow
  }, [stableState?.teams?.A?.strikes, stableState?.teams?.B?.strikes, stableState])

  // ✅ sonidos ganador
  useEffect(() => {
    if (!stableState) return

    const finishedNow = stableState.phase === 'FINISHED' && !!stableState.winner
    const hasWinnerAB = stableState.winner === 'A' || stableState.winner === 'B'
    const isLastRound = stableState.round === stableState.roundsTotal

    if (finishedNow && !prevFinished.current) {
      prevFinished.current = true

      if (prevFinishedRound.current !== stableState.round) {
        prevFinishedRound.current = stableState.round

        if (hasWinnerAB) {
          if (isLastRound) void playSound('triunfo', { restart: true })
          else void playSound('ronda', { restart: true })
        }
      }
    }

    if (!finishedNow) prevFinished.current = false
  }, [stableState?.phase, stableState?.winner, stableState?.round, stableState?.roundsTotal, stableState])

  // ✅ confetti+globos (una sola vez por FINISHED/round/winner)
  useEffect(() => {
    if (!stableState) return

    const finishedNow = stableState.phase === 'FINISHED' && !!stableState.winner
    if (!finishedNow) return

    const key = `${stableState.round}|${stableState.winner}|${stableState.teams?.A?.score}|${stableState.teams?.B?.score}`
    if (prevCelebrateKey.current === key) return
    prevCelebrateKey.current = key

    const c: ConfettiPiece[] = Array.from({ length: CONFETTI_COUNT }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.9,
      dur: 3.2 + Math.random() * 2.2,
      size: 6 + Math.random() * 10,
      rot: Math.random() * 360,
      drift: (Math.random() * 2 - 1) * 140,
      hue: Math.floor(Math.random() * 360),
    }))

    const b: Balloon[] = Array.from({ length: BALLOON_COUNT }).map((_, i) => ({
      id: i,
      left: 6 + Math.random() * 88,
      delay: Math.random() * 1.3,
      dur: 6.5 + Math.random() * 4.2,
      size: 46 + Math.random() * 46,
      hue: Math.floor(Math.random() * 360),
    }))

    setConfetti(c)
    setBalloons(b)
  }, [stableState?.phase, stableState?.winner, stableState?.round, stableState])

  if (!stableState || !current) return null

  const isSteal = stableState.phase === 'STEAL'
  const challengerTeam: 'A' | 'B' = stableState.turnTeam === 'A' ? 'A' : 'B'
  const showRetadorA = isSteal && challengerTeam === 'A'
  const showRetadorB = isSteal && challengerTeam === 'B'

  const winnerIsA = stableState.winner === 'A'
  const winnerIsB = stableState.winner === 'B'
  const winnerIsTie = stableState.winner === 'TIE'

  const winnerIsRetador =
    isSteal && ((winnerIsA && challengerTeam === 'A') || (winnerIsB && challengerTeam === 'B'))

  const winnerText = winnerIsTie
    ? '🤝 ¡EMPATE! Muerte súbita 😈'
    : winnerIsA
      ? `🏆 ¡GANÓ ${stableState.teams.A.name.toUpperCase()}!`
      : `🏆 ¡GANÓ ${stableState.teams.B.name.toUpperCase()}!`

  const winnerSub = winnerIsTie
    ? `Marcador: ${stableState.teams.A.name} ${stableState.teams.A.score} · ${stableState.teams.B.name} ${stableState.teams.B.score}`
    : `Final: ${stableState.teams.A.name} ${stableState.teams.A.score} · ${stableState.teams.B.name} ${stableState.teams.B.score}`

  const showWinnerOverlay = stableState.phase === 'FINISHED' && !!stableState.winner

  return (
    <div className={styles.fb2Root}>
      {/* MARCO DE LUCES FULLSCREEN */}
      <div className={`${styles.lightRail} ${styles.top}`} aria-hidden="true" />
      <div className={`${styles.lightRail} ${styles.bottom}`} aria-hidden="true" />
      <div className={`${styles.lightRail} ${styles.left}`} aria-hidden="true" />
      <div className={`${styles.lightRail} ${styles.right}`} aria-hidden="true" />

      {/* FONDO */}
      <div className={styles.bg} aria-hidden="true" />

      {/* OVERLAY X gigante que vuela */}
      {fly && (
        <div
          className={`${styles.flyX} ${fly.go ? styles.flyGo : ''}`}
          style={
            {
              '--to-x': `${fly.toX}px`,
              '--to-y': `${fly.toY}px`,
              '--fly-ms': `${FLY_TRAVEL_MS}ms`,
            } as CSSProperties
          }
          aria-hidden="true"
        >
          X
        </div>
      )}

      {/* OVERLAY GANADOR */}
      {showWinnerOverlay && (
        <div className={styles.winOverlay} role="status" aria-live="assertive">
          <div className={`${styles.spot} ${styles.s1}`} aria-hidden="true" />
          <div className={`${styles.spot} ${styles.s2}`} aria-hidden="true" />
          <div className={`${styles.spot} ${styles.s3}`} aria-hidden="true" />
          <div className={`${styles.spot} ${styles.s4}`} aria-hidden="true" />

          <div className={styles.winGlow} aria-hidden="true" />

          <div className={styles.confetti} aria-hidden="true">
            {confetti.map((p) => (
              <i
                key={p.id}
                className={styles.conf}
                style={
                  {
                    left: `${p.left}%`,
                    animationDelay: `${p.delay}s`,
                    animationDuration: `${p.dur}s`,
                    width: `${p.size}px`,
                    height: `${Math.max(6, p.size * 0.42)}px`,
                    transform: `rotate(${p.rot}deg)`,
                    '--drift': `${p.drift}px`,
                    '--h': `${p.hue}`,
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <div className={styles.balloons} aria-hidden="true">
            {balloons.map((b) => (
              <div
                key={b.id}
                className={styles.balloon}
                style={
                  {
                    left: `${b.left}%`,
                    animationDelay: `${b.delay}s`,
                    animationDuration: `${b.dur}s`,
                    width: `${b.size}px`,
                    height: `${Math.round(b.size * 1.25)}px`,
                    '--h': `${b.hue}`,
                  } as CSSProperties
                }
              >
                <span className={styles.shine} />
                <span className={styles.string} />
              </div>
            ))}
          </div>

          <div className={styles.winCard}>
            <div className={styles.winBadge}>
              🎉 GANADOR 🎉
              {winnerIsRetador && <span className={styles.retadorPill}>RETADOR</span>}
            </div>
            <div className={styles.winTitle}>{winnerText}</div>
            <div className={styles.winMeta}>{winnerSub}</div>

            <div className={styles.winPulseRow} aria-hidden="true">
              <span className={styles.pulseDot} />
              <span className={styles.pulseDot} />
              <span className={styles.pulseDot} />
            </div>

            <div className={styles.winHint}>El conductor decide cuándo continuar ▶</div>
          </div>
        </div>
      )}

      {/* CONTENIDO */}
      <div className={styles.wrap}>
        <header className={styles.header}>
          {/* ✅ SOLO CHIP DE RONDA */}
          <div className={styles.titleBox}>
            <div className={styles.sub}>
              <span className={styles.pill}>
                Ronda <b>{stableState.round}</b>/{stableState.roundsTotal}
              </span>
            </div>
          </div>
        </header>

        <main className={styles.stage}>
          {/* TEAM A */}
          <aside className={`${styles.team} ${stableState.turnTeam === 'A' ? styles.teamActive : ''}`}>
            <div className={styles.teamNameRow}>
              <div className={styles.teamName}>{stableState.teams.A.name}</div>
              {showRetadorA && <div className={styles.retadorTag}>RETADOR</div>}
            </div>

            <div className={styles.teamStrikes} aria-label="Strikes equipo A">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    strikeSlotsA.current[i] = el
                  }}
                  className={`${styles.teamX} ${i < Math.min(3, stableState.teams.A.strikes) ? styles.teamXOn : ''}`}
                >
                  X
                </div>
              ))}
            </div>

            <div className={styles.teamScore}>{String(stableState.teams.A.score)}</div>
          </aside>

          {/* BOARD */}
          <section className={styles.board}>
            <div className={styles.bank}>
              <div className={styles.bankLabel}>BANCO</div>
              <div className={styles.bankValue}>{String(stableState.roundBank).padStart(1, '0')}</div>
            </div>

            <div className={styles.question}>
              <div className={styles.qText}>{current.question}</div>
            </div>

            <div className={styles.answers}>
              {answers.map((a: any, i: number) => (
                <AnswerRow
                  key={i}
                  idx={i + 1}
                  revealed={a.revealed}
                  text={a.text}
                  points={a.points}
                  revealPulseKey={`${revealedVersionRef.current}-${i}-${a.revealed ? 1 : 0}`}
                />
              ))}
            </div>

            {stableState.phase === 'FINISHED' && stableState.winner && (
              <div className={styles.winner}>
                <div className={styles.winBig}>{winnerText}</div>
                <div className={styles.winSmall}>
                  Final: {stableState.teams.A.name} <b>{stableState.teams.A.score}</b> · {stableState.teams.B.name}{' '}
                  <b>{stableState.teams.B.score}</b>
                </div>
              </div>
            )}
          </section>

          {/* TEAM B */}
          <aside className={`${styles.team} ${stableState.turnTeam === 'B' ? styles.teamActive : ''}`}>
            <div className={styles.teamNameRow}>
              <div className={styles.teamName}>{stableState.teams.B.name}</div>
              {showRetadorB && <div className={styles.retadorTag}>RETADOR</div>}
            </div>

            <div className={styles.teamStrikes} aria-label="Strikes equipo B">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    strikeSlotsB.current[i] = el
                  }}
                  className={`${styles.teamX} ${i < Math.min(3, stableState.teams.B.strikes) ? styles.teamXOn : ''}`}
                >
                  X
                </div>
              ))}
            </div>

            <div className={styles.teamScore}>{String(stableState.teams.B.score)}</div>
          </aside>
        </main>
      </div>
    </div>
  )
}

/* ========= Inline AnswerRow ========= */
function AnswerRow({
  idx,
  revealed,
  text,
  points,
  revealPulseKey,
}: {
  idx: number
  revealed: boolean
  text: string
  points: number
  revealPulseKey: string
}) {
  // ✅ cuando se revela, cambiamos una key interna para reiniciar animación
  const [flipKey, setFlipKey] = useState('')

  useEffect(() => {
    if (revealed) setFlipKey(revealPulseKey)
  }, [revealed, revealPulseKey])

  return (
    <div className={styles.ar}>
      <div className={styles.n}>{idx}</div>

      {/* “tapa” + “destape” */}
      <div className={styles.mid}>
        <div className={styles.dots} aria-hidden="true" />

        {!revealed ? (
          <div className={styles.cover} aria-hidden="true">
            █████████████████████
          </div>
        ) : (
          <div key={flipKey} className={styles.revealFx}>
            <div className={styles.revealText}>{text}</div>
          </div>
        )}
      </div>

      <div className={styles.p}>
        {!revealed ? '' : (
          <div key={flipKey + '-p'} className={styles.revealPts}>
            {points}
          </div>
        )}
      </div>
    </div>
  )
}
