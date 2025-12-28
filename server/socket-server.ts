// server/socket-server.ts
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'

import type { Answer, BoardState, HostAction, RoundState, TeamId } from '../src/lib/gameTypes'
import { pickGameRounds } from '../src/lib/questionBank'

/**
 * ✅ IMPORTANTE (PROD):
 * Render/hosting asigna un puerto en process.env.PORT
 * Local puedes seguir usando 3001
 */
const PORT = Number(process.env.PORT || process.env.SOCKET_PORT || 3001)

/**
 * ✅ CORS
 * En producción pon: CORS_ORIGIN="https://tu-app.vercel.app"
 * Puedes poner varios separados por coma:
 * CORS_ORIGIN="https://tu-app.vercel.app,http://localhost:3000"
 */
const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']
const ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const ALLOWED_ORIGINS = ORIGINS.length ? ORIGINS : DEFAULT_ORIGINS

function isOriginAllowed(origin?: string) {
  if (!origin) return true // requests sin origin (curl, healthchecks)
  return ALLOWED_ORIGINS.includes(origin)
}

const app = express()

app.use(
  cors({
    origin: (origin, cb) => {
      if (isOriginAllowed(origin || undefined)) return cb(null, true)
      return cb(new Error(`CORS blocked for origin: ${origin}`))
    },
    credentials: true,
  }),
)

const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => {
      if (isOriginAllowed(origin || undefined)) return cb(null, true)
      return cb(new Error(`Socket CORS blocked for origin: ${origin}`))
    },
    credentials: true,
  },
})

/* Helpers */
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/**
 * ✅ FIX: limpia respuestas para que NO existan:
 * - text vacío
 * - puntos 0 / NaN / null / undefined
 * - puntos strings raros
 * - duplicados por texto (opcional)
 */
function normalizeAnswers(items: Array<{ text: string; points: number }>) {
  const cleaned = (items ?? [])
    .map((a) => {
      const text = String((a as any)?.text ?? '').trim()
      const pts = Number((a as any)?.points)
      return { text, points: pts }
    })
    .filter((a) => a.text.length > 0 && Number.isFinite(a.points) && a.points > 0)

  // quita duplicados por texto (para evitar "lo mismo" 2 veces)
  const seen = new Set<string>()
  const dedup = cleaned.filter((a) => {
    const key = a.text.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // máximo 5 (como 100 mexicanos)
  return dedup.slice(0, 5)
}

const makeAnswers = (items: Array<{ text: string; points: number }>): Answer[] => {
  const safe = normalizeAnswers(items)
  return safe.map((a) => ({ text: a.text, points: a.points, revealed: false }))
}

function isValidRound(src: {
  label: string
  multiplier: 1 | 2 | 3
  question: string
  answers: Array<{ text: string; points: number }>
}) {
  const q = String(src?.question ?? '').trim()
  const answers = normalizeAnswers(src?.answers ?? [])
  const multOk = src?.multiplier === 1 || src?.multiplier === 2 || src?.multiplier === 3
  return q.length > 0 && multOk && answers.length === 5
}

/**
 * ✅ PICK SEGURO:
 * si el banco trae preguntas con <5 respuestas válidas,
 * NO las usamos (así no salen “vacías/0 puntos”).
 */
function pickValidRounds(count: number) {
  const rounds: any[] = []
  const triesMax = 800
  let tries = 0

  while (rounds.length < count && tries < triesMax) {
    tries++
    const [candidate] = pickGameRounds(1)
    if (!candidate) continue
    if (!isValidRound(candidate)) continue
    rounds.push(candidate)
  }

  // fallback: intenta directo por si tu pickGameRounds(1) no funciona bien
  if (rounds.length < count) {
    const batch = pickGameRounds(count * 3)
    for (const r of batch) {
      if (rounds.length >= count) break
      if (r && isValidRound(r)) rounds.push(r)
    }
  }

  if (rounds.length < count) {
    console.warn(
      `[socket] ⚠ No pude completar ${count} rondas válidas. Obtuve ${rounds.length}. Revisa questionBank: cada pregunta debe tener 5 respuestas con puntos > 0.`,
    )
  }

  return rounds.slice(0, count)
}

function cloneRound(src: {
  label: string
  multiplier: 1 | 2 | 3
  question: string
  answers: Array<{ text: string; points: number }>
}): RoundState {
  return {
    label: String(src?.label ?? ''),
    multiplier: src.multiplier,
    question: String(src?.question ?? '').trim(),
    answers: makeAnswers(src?.answers ?? []),
  }
}

function otherTeam(t: TeamId): TeamId {
  return t === 'A' ? 'B' : 'A'
}

/** Estado de match en memoria */
let matchRounds = pickValidRounds(10)

function makeInitialState(): BoardState {
  const roundsTotal = 10
  matchRounds = pickValidRounds(roundsTotal)

  return {
    phase: 'SETUP',

    roundsTotal,
    round: 1,
    roundIndex: 0,

    maxStrikes: 3,

    teams: {
      A: { id: 'A', name: 'Equipo 1', score: 0, strikes: 0 },
      B: { id: 'B', name: 'Equipo 2', score: 0, strikes: 0 },
    },

    turnTeam: 'A',

    roundBank: 0,
    scoringLocked: false,

    steal: null,

    winner: null,
    awaitingChallengerDecision: false,

    current: matchRounds[0]
      ? cloneRound(matchRounds[0])
      : ({ label: 'Ronda 1', multiplier: 1, question: 'Sin preguntas válidas', answers: [] } as any),
  }
}

let state: BoardState = makeInitialState()

function emitState() {
  io.emit('board:state', state)
}

function resetRoundForIndex(idx: number) {
  state.roundIndex = idx
  state.round = idx + 1

  const src = matchRounds[idx]
  state.current = src
    ? cloneRound(src)
    : ({ label: `Ronda ${idx + 1}`, multiplier: 1, question: 'Sin preguntas válidas', answers: [] } as any)

  // ✅ reinicio automático de taches al cambiar de ronda
  state.teams.A.strikes = 0
  state.teams.B.strikes = 0

  state.turnTeam = 'A'
  state.roundBank = 0
  state.scoringLocked = false
  state.steal = null
}

function computeWinner(): TeamId | 'TIE' {
  const a = state.teams.A.score
  const b = state.teams.B.score
  if (a === b) return 'TIE'
  return a > b ? 'A' : 'B'
}

/**
 * ✅ Regla: “ronda jugada” = algo cambió en la ronda.
 * (reveal OR strikes OR bank)
 */
function roundHasProgress() {
  const anyRevealed = (state.current?.answers ?? []).some((a: any) => !!a?.revealed)
  const anyStrikes = (state.teams.A.strikes ?? 0) > 0 || (state.teams.B.strikes ?? 0) > 0
  const anyBank = (state.roundBank ?? 0) > 0
  return anyRevealed || anyStrikes || anyBank
}

function applyAction(action: HostAction) {
  switch (action.type) {
    /**
     * ✅ NOMBRES:
     * - SOLO en SETUP (al inicio).
     * - En FINISHED + awaitingChallengerDecision:
     *   solo se permite si el ganador NO cambia nombre
     *   (el retador reemplaza al perdedor).
     */
    case 'SET_TEAMS': {
      const allowSetup = state.phase === 'SETUP'
      const allowRetador = state.phase === 'FINISHED' && !!state.awaitingChallengerDecision
      if (!allowSetup && !allowRetador) return

      if (allowRetador) {
        // Solo aplica si hay ganador A/B
        if (state.winner !== 'A' && state.winner !== 'B') return
        const w: TeamId = state.winner

        const winnerName = state.teams[w].name
        const nextA = String(action.teamA ?? '').trim()
        const nextB = String(action.teamB ?? '').trim()

        // ganador NO puede cambiar nombre
        if (w === 'A' && nextA && nextA !== winnerName) return
        if (w === 'B' && nextB && nextB !== winnerName) return

        const safeA = (nextA || state.teams.A.name).trim() || 'Equipo 1'
        const safeB = (nextB || state.teams.B.name).trim() || 'Equipo 2'

        state.teams.A = { ...state.teams.A, name: safeA, score: 0, strikes: 0 }
        state.teams.B = { ...state.teams.B, name: safeB, score: 0, strikes: 0 }

        // volvemos a SETUP para START_MATCH
        state.phase = 'SETUP'
        state.winner = null
        state.awaitingChallengerDecision = false

        emitState()
        return
      }

      // SETUP normal: sí deja cambiar ambos
      state.teams.A = { ...state.teams.A, name: (action.teamA || 'Equipo 1').trim(), score: 0, strikes: 0 }
      state.teams.B = { ...state.teams.B, name: (action.teamB || 'Equipo 2').trim(), score: 0, strikes: 0 }
      state.phase = 'SETUP'
      state.winner = null
      state.awaitingChallengerDecision = false

      emitState()
      return
    }

    case 'SET_ROUNDS_TOTAL': {
      // ✅ solo en SETUP (si ya están jugando, no cambies rondas)
      if (state.phase !== 'SETUP') return

      state.roundsTotal = clamp(Number(action.roundsTotal || 10), 1, 50)
      matchRounds = pickValidRounds(state.roundsTotal)

      state.winner = null
      state.awaitingChallengerDecision = false

      resetRoundForIndex(0)
      emitState()
      return
    }

    case 'START_MATCH': {
      // ✅ solo arrancar desde SETUP
      if (state.phase !== 'SETUP') return

      matchRounds = pickValidRounds(state.roundsTotal)

      state.phase = 'PLAYING'
      state.winner = null
      state.awaitingChallengerDecision = false

      state.teams.A.score = 0
      state.teams.B.score = 0

      resetRoundForIndex(0)
      emitState()
      return
    }

    case 'SET_TURN_TEAM': {
      if (state.phase === 'STEAL' || state.phase === 'SETUP') return
      state.turnTeam = action.team
      emitState()
      return
    }

    case 'REVEAL': {
      if (state.phase === 'SETUP') return

      const a = state.current.answers[action.index]
      if (!a) return
      if (a.revealed) return

      const text = String(a.text ?? '').trim()
      const base = Number((a as any).points)
      if (!text || !Number.isFinite(base) || base <= 0) return

      state.current.answers[action.index] = { ...a, revealed: true }

      if (state.phase === 'PLAYING' && !state.scoringLocked) {
        const total = base * state.current.multiplier
        state.teams[state.turnTeam].score += total
        state.roundBank += base
      }

      emitState()
      return
    }

    case 'HIDE': {
      if (state.phase === 'SETUP') return

      const a = state.current.answers[action.index]
      if (!a) return
      if (!a.revealed) return

      const text = String(a.text ?? '').trim()
      const base = Number((a as any).points)

      if (!text || !Number.isFinite(base) || base <= 0) {
        state.current.answers[action.index] = { ...a, revealed: false }
        emitState()
        return
      }

      if (state.phase === 'PLAYING' && !state.scoringLocked) {
        const total = base * state.current.multiplier
        state.teams[state.turnTeam].score -= total
        state.roundBank = Math.max(0, state.roundBank - base)
      }

      state.current.answers[action.index] = { ...a, revealed: false }
      emitState()
      return
    }

    case 'REVEAL_ALL': {
      if (state.phase === 'SETUP') return
      state.current.answers = state.current.answers.map((x) => ({ ...x, revealed: true }))
      emitState()
      return
    }

    case 'HIDE_ALL': {
      if (state.phase === 'SETUP') return
      state.current.answers = state.current.answers.map((x) => ({ ...x, revealed: false }))
      emitState()
      return
    }

    case 'STRIKE_ADD': {
      if (state.phase !== 'PLAYING') return
      if (state.scoringLocked) return

      const t = state.turnTeam
      const next = clamp(state.teams[t].strikes + 1, 0, state.maxStrikes)
      state.teams[t].strikes = next

      if (next >= state.maxStrikes) {
        const defender: TeamId = t
        const stealer: TeamId = otherTeam(defender)

        state.phase = 'STEAL'
        state.steal = { defender, stealer, resolved: false }
        state.turnTeam = stealer
      }

      emitState()
      return
    }

    /**
     * ❌ Regla: el conductor NO puede limpiar taches manualmente.
     * Los taches se limpian automáticamente:
     * - en resetRoundForIndex()
     */
    case 'STRIKE_CLEAR': {
      return
    }

    /**
     * ✅ Robo:
     * - Si éxito: transfiere banco y NO deja X
     * - Si falló: se muestra 1 X al equipo que robó (stealer)
     */
    case 'STEAL_RESOLVE': {
      if (state.phase !== 'STEAL' || !state.steal) return

      // ✅ FIX TS7053: forzamos a TeamId para indexar state.teams
      const defender = state.steal.defender as TeamId
      const stealer = state.steal.stealer as TeamId

      if (action.success) {
        const bankTotal = state.roundBank * state.current.multiplier
        state.teams[defender].score -= bankTotal
        state.teams[stealer].score += bankTotal

        // ✅ si robó bien, NO debe quedar X
        state.teams[stealer].strikes = 0
      } else {
        // ✅ si el robo FALLÓ, mostrar 1 X al equipo que robó
        state.teams[stealer].strikes = 1
      }

      // el defensor ya no debe verse con sus 3 taches
      state.teams[defender].strikes = 0

      state.steal = { ...state.steal, resolved: true }
      state.phase = 'POST_REVEAL'
      state.scoringLocked = true

      emitState()
      return
    }

    /**
     * ✅ Regla: NO pasar de ronda si no se jugó.
     */
    case 'NEXT_ROUND': {
      if (state.phase === 'STEAL' || state.phase === 'SETUP') return
      if (state.phase === 'PLAYING' && !roundHasProgress()) return

      const next = state.round + 1
      if (next > state.roundsTotal) {
        state.phase = 'FINISHED'
        state.winner = computeWinner()
        state.awaitingChallengerDecision = true
        emitState()
        return
      }

      resetRoundForIndex(next - 1)
      state.phase = 'PLAYING'
      emitState()
      return
    }

    /**
     * ❌ Bloqueado:
     * Ya no se usa este flujo. El retador se aplica con SET_TEAMS y luego START_MATCH.
     */
    case 'CHALLENGER_YES': {
      return
    }

    /**
     * ✅ NO HAY RETADOR:
     * Volvemos a SETUP para capturar nombres y rondas.
     */
    case 'CHALLENGER_NO': {
      if (state.phase !== 'FINISHED') return

      state.phase = 'SETUP'
      state.winner = null
      state.awaitingChallengerDecision = false

      matchRounds = pickValidRounds(state.roundsTotal)
      resetRoundForIndex(0)

      emitState()
      return
    }

    case 'RESET_ALL': {
      state = makeInitialState()
      matchRounds = pickValidRounds(state.roundsTotal)
      emitState()
      return
    }

    default:
      return
  }
}

/** Socket */
io.on('connection', (socket) => {
  socket.emit('board:state', state)

  socket.on('board:get', () => {
    socket.emit('board:state', state)
  })

  socket.on('host:action', (action: HostAction) => {
    applyAction(action)
  })
})

app.get('/health', (_, res) =>
  res.json({
    ok: true,
    port: PORT,
    allowedOrigins: ALLOWED_ORIGINS,
    roundsTotal: state.roundsTotal,
    phase: state.phase,
  }),
)

/** ✅ APAGADO LIMPIO */
let shuttingDown = false
function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[socket] ${signal} received -> shutting down...`)

  try {
    io.close(() => {
      try {
        // @ts-ignore
        io.engine?.close?.()
      } catch {}

      httpServer.close(() => {
        console.log('[socket] server closed, bye 👋')
        process.exit(0)
      })
    })
  } catch {
    process.exit(0)
  }

  setTimeout(() => process.exit(1), 2000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGUSR2', () => shutdown('SIGUSR2'))

httpServer.on('error', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`\n[socket] ❌ Puerto ${PORT} ocupado.`)
    console.error('[socket] Cierra el proceso viejo o mata el puerto con PowerShell:')
    console.error(`netstat -ano | findstr :${PORT}`)
    console.error('taskkill /PID <PID> /F\n')
    process.exit(1)
  }
  console.error('[socket] server error:', err)
  process.exit(1)
})

httpServer.listen(PORT, () => {
  console.log(`[socket] listening on http://localhost:${PORT}`)
  console.log(`[socket] allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
})
