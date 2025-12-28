// src/lib/gameTypes.ts

export type TeamId = 'A' | 'B'
export type GamePhase = 'SETUP' | 'PLAYING' | 'STEAL' | 'POST_REVEAL' | 'FINISHED'

export type Answer = {
  text: string
  points: number
  revealed: boolean
}

export type RoundState = {
  label: string
  multiplier: 1 | 2 | 3
  question: string
  answers: Answer[]
}

export type TeamState = {
  id: TeamId
  name: string
  score: number
  strikes: number
}

export type Winner = TeamId | 'TIE' | null

export type BoardState = {
  phase: GamePhase

  roundsTotal: number
  round: number
  roundIndex: number

  maxStrikes: number

  teams: Record<TeamId, TeamState>

  /** Equipo actualmente en turno para contestar */
  turnTeam: TeamId

  /** Banco (puntos acumulados EN ESTA RONDA) ya sumados al equipo defensor */
  roundBank: number

  /** Si true, revelar ya NO suma puntos (solo mostrar) */
  scoringLocked: boolean

  /** Datos del robo cuando se activa */
  steal: null | {
    defender: TeamId
    stealer: TeamId
    resolved: boolean
  }

  /** Ganador al terminar */
  winner: Winner

  /** Mostrar decisión de retador */
  awaitingChallengerDecision: boolean

  current: RoundState
}

export type HostAction =
  | { type: 'SET_TEAMS'; teamA: string; teamB: string }
  | { type: 'SET_ROUNDS_TOTAL'; roundsTotal: number }
  | { type: 'START_MATCH' }
  | { type: 'SET_TURN_TEAM'; team: TeamId }
  | { type: 'REVEAL'; index: number }
  | { type: 'HIDE'; index: number }
  | { type: 'REVEAL_ALL' }
  | { type: 'HIDE_ALL' }
  | { type: 'STRIKE_ADD' }
  | { type: 'STRIKE_CLEAR' }
  | { type: 'STEAL_RESOLVE'; success: boolean }
  | { type: 'NEXT_ROUND' }
  | { type: 'CHALLENGER_YES'; challengerName: string }
  | { type: 'CHALLENGER_NO' }
  | { type: 'RESET_ALL' }

export type GameCtx = {
  state: BoardState | null
  dispatch: (action: HostAction) => void
  send: (action: HostAction) => void
  connected: boolean
}
