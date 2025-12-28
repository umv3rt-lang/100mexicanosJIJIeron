'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from './GameProvider'
import { playSound } from '../lib/sounds'
import type { TeamId } from '@/src/lib/gameTypes'

function isWinnerAB(w: any): w is 'A' | 'B' {
  return w === 'A' || w === 'B'
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

export default function HostPanel() {
  const { state, dispatch } = useGame()

  // ====== SETUP form ======
  const [teamAInput, setTeamAInput] = useState('Equipo 1')
  const [teamBInput, setTeamBInput] = useState('Equipo 2')
  const [roundsInput, setRoundsInput] = useState(10)

  // ====== Retador modal ======
  const [challengerName, setChallengerName] = useState('Retador')

  // ✅ hooks SIEMPRE (aunque state sea null)
  const phase = state?.phase ?? 'SETUP'
  const isSetup = phase === 'SETUP'
  const isPlaying = phase === 'PLAYING'
  const isSteal = phase === 'STEAL'
  const isPostReveal = phase === 'POST_REVEAL'
  const isFinished = phase === 'FINISHED'

  const roundBank = useMemo(() => state?.roundBank ?? 0, [state?.roundBank])

  const displayAnswers = useMemo(() => {
    const list = state?.current?.answers ?? []
    return list
      .map((a: any, originalIndex: number) => ({ ...a, __idx: originalIndex }))
      .filter((a: any) => (a?.text ?? '').trim().length > 0)
  }, [state?.current?.answers])

  const activeName = useMemo(() => {
    if (!state) return ''
    return state.turnTeam === 'A' ? state.teams.A.name : state.teams.B.name
  }, [state])

  // ✅ “Ronda jugada”: revealed OR strikes OR bank>0
  const roundHasProgress = useMemo(() => {
    const anyRevealed = (state?.current?.answers ?? []).some((a: any) => !!a?.revealed)
    const anyStrikes = (state?.teams?.A?.strikes ?? 0) > 0 || (state?.teams?.B?.strikes ?? 0) > 0
    const anyBank = (state?.roundBank ?? 0) > 0
    return anyRevealed || anyStrikes || anyBank
  }, [state?.current?.answers, state?.teams?.A?.strikes, state?.teams?.B?.strikes, state?.roundBank])

  // ====== Sync inputs from server while in SETUP ======
  const didInitSetupRef = useRef(false)
  useEffect(() => {
    if (!state) return
    if (state.phase !== 'SETUP') {
      didInitSetupRef.current = false
      return
    }
    if (!didInitSetupRef.current) {
      setTeamAInput(state.teams.A.name || 'Equipo 1')
      setTeamBInput(state.teams.B.name || 'Equipo 2')
      setRoundsInput(clamp(state.roundsTotal || 10, 1, 50))
      didInitSetupRef.current = true
    }
  }, [state?.phase, state?.teams?.A?.name, state?.teams?.B?.name, state?.roundsTotal, state])

  // ===== actions =====
  const reveal = (i: number) => state && dispatch({ type: 'REVEAL', index: i } as any)
  const strike = () => state && dispatch({ type: 'STRIKE_ADD' } as any)
  const nextRound = () => state && dispatch({ type: 'NEXT_ROUND' } as any)
  const setTurn = (team: TeamId) => state && dispatch({ type: 'SET_TURN_TEAM', team } as any)
  const stealSuccess = () => state && dispatch({ type: 'STEAL_RESOLVE', success: true } as any)
  const stealFail = () => state && dispatch({ type: 'STEAL_RESOLVE', success: false } as any)

  // ===== SETUP submit =====
  const canApplySetup = useMemo(() => {
    const a = (teamAInput || '').trim()
    const b = (teamBInput || '').trim()
    const r = Number(roundsInput)
    return a.length > 0 && b.length > 0 && Number.isFinite(r) && r >= 1 && r <= 50
  }, [teamAInput, teamBInput, roundsInput])

  const applySetupOnly = () => {
    if (!state) return
    if (state.phase !== 'SETUP') return // ✅ no permitir cambiar después

    const a = (teamAInput || '').trim() || 'Equipo 1'
    const b = (teamBInput || '').trim() || 'Equipo 2'
    const r = clamp(Number(roundsInput || 10), 1, 50)

    dispatch({ type: 'SET_TEAMS', teamA: a, teamB: b } as any)
    dispatch({ type: 'SET_ROUNDS_TOTAL', roundsTotal: r } as any)
  }

  // ✅ AJUGAR: cuando el conductor inicia
  const localStartAjugarRef = useRef(false)
  const applySetupAndStart = async () => {
    if (!state) return
    if (state.phase !== 'SETUP') return

    applySetupOnly()

    // marcamos para que el effect no lo duplique
    localStartAjugarRef.current = true
    try {
      await playSound('ajugar', { restart: true })
    } catch {}

    dispatch({ type: 'START_MATCH' } as any)
  }

  // ✅ AJUGAR: si inicia desde otro cliente (SETUP -> PLAYING) reproducir una sola vez
  const prevPhaseRef = useRef<string>('INIT')
  const playedAjugarKeyRef = useRef<string>('') // evita duplicados por reconexión
  useEffect(() => {
    if (!state) return

    const prev = prevPhaseRef.current
    const now = state.phase
    prevPhaseRef.current = now

    // key estable para el arranque “nuevo”
    const key = `${state.phase}|r${state.round}|A${state.teams.A.score}|B${state.teams.B.score}`

    const isFreshStart =
      now === 'PLAYING' &&
      state.round === 1 &&
      state.teams.A.score === 0 &&
      state.teams.B.score === 0

    if (isFreshStart && prev !== 'PLAYING') {
      // si el click local ya lo reprodujo, no repetimos
      if (localStartAjugarRef.current) {
        localStartAjugarRef.current = false
        playedAjugarKeyRef.current = key
        return
      }

      if (playedAjugarKeyRef.current === key) return
      playedAjugarKeyRef.current = key

      void playSound('ajugar', { restart: true })
    }
  }, [state])

  // ===== FINISH MODAL =====
  const showFinishModal = !!state && isFinished && !!state.awaitingChallengerDecision

  const winnerTeam: TeamId | null = !!state && isWinnerAB(state.winner) ? state.winner : null
  const loserTeam: TeamId | null = winnerTeam ? (winnerTeam === 'A' ? 'B' : 'A') : null

  const winnerText =
    !state
      ? 'Fin'
      : state.winner === 'A'
        ? `🏆 Ganó: ${state.teams.A.name}`
        : state.winner === 'B'
          ? `🏆 Ganó: ${state.teams.B.name}`
          : state.winner === 'TIE'
            ? '🤝 Empate (muerte súbita)'
            : 'Fin'

  // ✅ Retador: ganador NO cambia; reemplaza perdedor
  const applyChallengerAndStart = () => {
    if (!state) return
    if (!winnerTeam || !loserTeam) return

    const name = (challengerName || '').trim() || 'Retador'
    const nextA = loserTeam === 'A' ? name : state.teams.A.name
    const nextB = loserTeam === 'B' ? name : state.teams.B.name

    dispatch({ type: 'SET_TEAMS', teamA: nextA, teamB: nextB } as any)
    dispatch({ type: 'START_MATCH' } as any)
  }

  const askNewNames = () => {
    if (!state) return
    dispatch({ type: 'CHALLENGER_NO' } as any)
  }

  // ✅ Bloqueos UI
  const disableNextRound = !state || isSetup || isSteal || (isPlaying && !roundHasProgress)
  const disableStrike = !state || isSetup || isSteal || isPostReveal
  const disableTurnSwitch = !state || isSetup || isSteal

  // ====== Render ======
  if (!state) {
    return (
      <div className="hp2Root">
        <div className="hp2Top">
          <div>
            <div className="hp2Title">🎛️ Panel del Conductor</div>
            <div className="hp2Meta">
              <span className="badge ghost">🔌 Conectando con el servidor…</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">Estado</div>
          <div className="callout">Esperando estado del juego (socket)…</div>
        </div>

        <GlobalStyles />
      </div>
    )
  }

  return (
    <div className="hp2Root">
      <div className="hp2Top">
        <div className="hp2Brand">
          <div className="hp2Title">🎛️ Panel del Conductor</div>
          <div className="hp2Meta">
            <span className="badge">
              Estado: <b>{state.phase}</b>
            </span>
            <span className="badge">
              Ronda: <b>{state.round}</b>/{state.roundsTotal}
            </span>
            <span className="badge gold">
              Banco: <b>{roundBank}</b>
            </span>
            {isSteal ? <span className="badge warn">🔥 Robo</span> : <span className="badge ok">✅ Normal</span>}
            {isPostReveal && <span className="badge ghost">POST</span>}
          </div>
        </div>

        <div className="hp2Scores">
          <ScorePill
            tag="A"
            name={state.teams.A.name}
            score={state.teams.A.score}
            strikes={state.teams.A.strikes}
            active={state.turnTeam === 'A'}
          />
          <ScorePill
            tag="B"
            name={state.teams.B.name}
            score={state.teams.B.score}
            strikes={state.teams.B.strikes}
            active={state.turnTeam === 'B'}
          />
        </div>
      </div>

      <div className="hp2Grid">
        <div className="card">
          {isSetup ? (
            <>
              <div className="cardTitle">Configuración (solo al inicio)</div>
              <div className="hint" style={{ marginTop: 8 }}>
                Define <b>nombres</b> y <b>rondas</b>. Después ya no se puede editar.
              </div>

              <div className="divider" />

              <div className="field">
                <label>Equipo A</label>
                <input value={teamAInput} onChange={(e) => setTeamAInput(e.target.value)} placeholder="Equipo 1" />
              </div>

              <div className="field">
                <label>Equipo B</label>
                <input value={teamBInput} onChange={(e) => setTeamBInput(e.target.value)} placeholder="Equipo 2" />
              </div>

              <div className="field">
                <label>Rondas</label>
                <select value={roundsInput} onChange={(e) => setRoundsInput(Number(e.target.value))}>
                  {[3, 5, 7, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>
                      {n} rondas
                    </option>
                  ))}
                </select>
              </div>

              <div className="actions">
                <button className="btn ghost" onClick={applySetupOnly} disabled={!canApplySetup} type="button">
                  💾 Guardar (sin iniciar)
                </button>

                <button className="btn ok" onClick={applySetupAndStart} disabled={!canApplySetup} type="button">
                  ▶ Iniciar juego (sonido)
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="cardTitle">Turno</div>

              <div className="turnRow">
                <button
                  className={`turnBtn ${state.turnTeam === 'A' ? 'turnBtnOn' : ''}`}
                  onClick={() => setTurn('A')}
                  disabled={disableTurnSwitch}
                  type="button"
                >
                  <span className="tag">A</span>
                  <span className="name">{state.teams.A.name}</span>
                  <span className="mini">{state.teams.A.strikes ? 'X'.repeat(state.teams.A.strikes) : ''}</span>
                </button>

                <button
                  className={`turnBtn ${state.turnTeam === 'B' ? 'turnBtnOn' : ''}`}
                  onClick={() => setTurn('B')}
                  disabled={disableTurnSwitch}
                  type="button"
                >
                  <span className="tag">B</span>
                  <span className="name">{state.teams.B.name}</span>
                  <span className="mini">{state.teams.B.strikes ? 'X'.repeat(state.teams.B.strikes) : ''}</span>
                </button>
              </div>

              <div className="hint">
                En turno: <b>{activeName}</b>
              </div>

              <div className="divider" />

              <div className="cardTitle">Acciones</div>
              <div className="actions">
                <button className="btn danger" onClick={strike} disabled={disableStrike} type="button">
                  ❌ Tache (equipo en turno)
                </button>

                <button className="btn gold" onClick={nextRound} disabled={disableNextRound} type="button">
                  ▶ Siguiente ronda
                </button>
              </div>

              {!isSteal && isPlaying && !roundHasProgress && (
                <div className="callout warn">
                  ⛔ No puedes pasar de ronda todavía. Primero debe “jugarse” (destapar algo o marcar un tache).
                </div>
              )}

              {isPostReveal && (
                <div className="callout">
                  ✅ Robo resuelto. Revela lo restante <b>una por una</b> (sin puntos) y luego pasa a la siguiente ronda.
                </div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <div className="cardTitle">Pregunta</div>
          <div className="question">{state.current.question}</div>

          <div className="divider" />

          <div className="cardTitle">Respuestas</div>
          <div className="answers">
            {displayAnswers.map((a: any, viewIndex: number) => (
              <button
                key={a.__idx}
                className={`answerBtn ${a.revealed ? 'answerOn' : ''}`}
                onClick={() => reveal(a.__idx)}
                disabled={isSetup}
                type="button"
              >
                <div className="answerLeft">
                  <span className="idx">{viewIndex + 1}</span>
                  <span className="txt">{a.text}</span>
                </div>
                <div className="answerRight">
                  <span className="pts">{a.points}</span>
                  <span className="ok">{a.revealed ? '✅' : ''}</span>
                </div>
                {isPostReveal && !a.revealed && <div className="subnote">(sin puntos)</div>}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">Robo</div>

          {isSteal ? (
            <>
              <div className="callout warn">
                🔥 Responde <b>{activeName}</b> (1 oportunidad). Si acierta, transfiere <b>{roundBank}</b>.
              </div>

              <div className="actions">
                <button className="btn ok" onClick={stealSuccess} type="button">
                  ✅ Robo exitoso
                </button>
                <button className="btn ghost" onClick={stealFail} type="button">
                  ❌ Robo falló
                </button>
              </div>

              <div className="hint">* Solo se transfiere el banco de la ronda (no el marcador total).</div>
            </>
          ) : (
            <div className="callout">
              Cuando el equipo en turno falla 3 veces, aquí confirmas si el robo fue exitoso o no.
            </div>
          )}
        </div>
      </div>

      {showFinishModal && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modalHead">
              <div className="modalBadge">FIN</div>
              <div className="modalTitle">{winnerText}</div>
              <div className="modalScore">
                {state.teams.A.name}: <b>{state.teams.A.score}</b> · {state.teams.B.name}: <b>{state.teams.B.score}</b>
              </div>
            </div>

            <div className="modalBody">
              <div className="row">
                <div className="label">¿Hay retador?</div>
                <div className="small">
                  El ganador <b>NO</b> cambia su nombre. El retador reemplaza al perdedor.
                </div>
              </div>

              <div className="field">
                <label>Nombre del retador</label>
                <input
                  value={challengerName}
                  onChange={(e) => setChallengerName(e.target.value)}
                  placeholder="Retador"
                />
                {winnerTeam && loserTeam && (
                  <div className="small">
                    Ganador: <b>{winnerTeam === 'A' ? state.teams.A.name : state.teams.B.name}</b> · Reemplazar:
                    <b> {loserTeam === 'A' ? state.teams.A.name : state.teams.B.name}</b>
                  </div>
                )}
              </div>

              <div className="modalActions">
                <button className="btn ok" onClick={applyChallengerAndStart} type="button" disabled={!winnerTeam}>
                  ✅ Sí hay retador (iniciar)
                </button>
                <button className="btn ghost" onClick={askNewNames} type="button">
                  ❌ No hay retador (capturar nombres)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <GlobalStyles />
    </div>
  )
}

/** ✅ SOLO CAMBIÉ ESTILOS (más moderno + mobile) */
function GlobalStyles() {
  return (
    <style jsx global>{`
      :root{
        --bg0:#06060a;
        --bg1:#0b0c12;
        --card:rgba(255,255,255,.06);
        --card2:rgba(0,0,0,.22);
        --stroke:rgba(255,255,255,.12);
        --stroke2:rgba(255,255,255,.18);
        --text:rgba(255,255,255,.92);
        --muted:rgba(255,255,255,.70);
        --muted2:rgba(255,255,255,.55);
        --accentA: rgba(255, 200, 120, .95);
        --accentB: rgba(255, 140, 40, .92);
        --good: rgba(34,197,94,.95);
        --warn: rgba(245,158,11,.95);
        --bad: rgba(239,68,68,.95);
        --shadow: 0 22px 60px rgba(0,0,0,.55);
      }

      *{ box-sizing: border-box; }
      html,body{ height:100%; }
      body{ margin:0; }

      .hp2Root{
        min-height:100vh;
        color: var(--text);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;

        /* fondo más “premium” */
        background:
          radial-gradient(1100px circle at 12% -10%, rgba(255,180,90,.16), transparent 55%),
          radial-gradient(900px circle at 96% 20%, rgba(255,120,40,.14), transparent 60%),
          radial-gradient(700px circle at 40% 105%, rgba(90,140,255,.10), transparent 60%),
          linear-gradient(180deg, var(--bg0), var(--bg1));

        padding: clamp(12px, 2.2vw, 18px);
        display:grid;
        gap:12px;
      }

      /* ancho bonito en pantallas grandes */
      .hp2Root > *{
        width:100%;
        max-width: 1280px;
        margin-inline:auto;
      }

      .hp2Top{
        border: 1px solid var(--stroke);
        background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.04));
        border-radius: 20px;
        padding: 14px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(12px);
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        flex-wrap:wrap;
      }

      .hp2Brand{ min-width: 260px; }
      .hp2Title{
        font-weight: 1000;
        letter-spacing: -0.02em;
        font-size: 18px;
        line-height: 1.05;
      }
      .hp2Meta{
        margin-top: 10px;
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        align-items:center;
      }

      .hp2Scores{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        align-items:stretch;
      }

      .badge{
        border-radius: 999px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 900;
        border: 1px solid var(--stroke);
        background: rgba(0,0,0,.24);
        box-shadow: 0 10px 30px rgba(0,0,0,.35);
      }
      .badge b{ color: rgba(255,255,255,.98); }
      .badge.gold{ border-color: rgba(245,158,11,.32); background: rgba(245,158,11,.12); }
      .badge.ok{ border-color: rgba(34,197,94,.30); background: rgba(34,197,94,.10); }
      .badge.warn{ border-color: rgba(245,158,11,.30); background: rgba(245,158,11,.10); }
      .badge.ghost{ opacity:.75; }

      .hp2Grid{
        display:grid;
        grid-template-columns: 360px 1fr 360px;
        gap:12px;
        align-items:start;
      }

      .card{
        border-radius: 20px;
        border: 1px solid var(--stroke);
        background: var(--card);
        box-shadow: 0 18px 50px rgba(0,0,0,.40);
        padding: 14px;
        backdrop-filter: blur(12px);
      }

      .cardTitle{
        font-size: 12px;
        opacity: .72;
        font-weight: 1000;
        letter-spacing: .12em;
        text-transform: uppercase;
      }

      .divider{
        height:1px;
        background: rgba(255,255,255,.10);
        margin: 12px 0;
      }

      .turnRow{ margin-top:10px; display:grid; gap:10px; }

      .turnBtn{
        width:100%;
        border-radius: 18px;
        border: 1px solid var(--stroke);
        background: rgba(0,0,0,.22);
        padding: 12px;
        display:flex;
        align-items:center;
        gap: 10px;
        font-weight: 950;
        cursor:pointer;
        transition: transform .12s ease, border-color .12s ease, background .12s ease;
      }
      .turnBtn:disabled{ opacity:.55; cursor:not-allowed; }
      .turnBtn:hover:not(:disabled){
        transform: translateY(-1px);
        border-color: var(--stroke2);
        background: rgba(0,0,0,.28);
      }
      .turnBtnOn{
        border-color: rgba(255,220,140,.34);
        box-shadow: 0 0 0 3px rgba(255,180,90,.10);
      }

      .tag{
        width: 34px;
        height: 34px;
        border-radius: 12px;
        display:grid;
        place-items:center;
        color: rgba(20,8,2,.95);
        background: linear-gradient(180deg, var(--accentA), var(--accentB));
        flex: 0 0 auto;
      }
      .name{
        flex:1;
        text-align:left;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        min-width: 0;
      }
      .mini{ opacity:.92; }

      .question{
        margin-top: 10px;
        font-weight: 1000;
        letter-spacing: -0.02em;
        font-size: 16px;
        line-height: 1.25;
      }

      .answers{
        margin-top: 10px;
        display:grid;
        gap: 8px;
        max-height: 64vh;
        overflow:auto;
        padding-right: 6px;
        overscroll-behavior: contain;
      }
      .answers::-webkit-scrollbar{ width:10px; }
      .answers::-webkit-scrollbar-thumb{
        background: rgba(255,255,255,.12);
        border-radius: 999px;
        border: 2px solid rgba(0,0,0,.22);
      }

      .answerBtn{
        width:100%;
        text-align:left;
        border-radius: 18px;
        border: 1px solid var(--stroke);
        background: rgba(0,0,0,.20);
        padding: 12px;
        cursor:pointer;
        display:grid;
        gap: 8px;
        transition: transform .12s ease, border-color .12s ease, background .12s ease;
      }
      .answerBtn:hover:not(:disabled){
        transform: translateY(-1px);
        border-color: var(--stroke2);
        background: rgba(0,0,0,.26);
      }
      .answerBtn:disabled{ opacity:.55; cursor:not-allowed; }
      .answerOn{
        border-color: rgba(34,197,94,.32);
        background: rgba(34,197,94,.10);
      }

      .answerLeft{ display:flex; gap:10px; align-items:center; min-width:0; }
      .idx{
        width: 30px;
        height: 30px;
        border-radius: 11px;
        display:grid;
        place-items:center;
        color: rgba(20,8,2,.95);
        background: linear-gradient(180deg, var(--accentA), var(--accentB));
        flex: 0 0 auto;
        font-weight: 1000;
      }
      .txt{
        font-weight: 950;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        opacity:.96;
        min-width: 0;
      }
      .answerRight{
        display:flex;
        justify-content:space-between;
        align-items:center;
        opacity:.9;
        font-weight: 950;
      }
      .pts{ font-variant-numeric: tabular-nums; }
      .ok{ width: 24px; text-align:right; }
      .subnote{ font-size: 12px; opacity:.65; }

      .actions{
        margin-top: 12px;
        display:flex;
        flex-wrap:wrap;
        gap: 10px;
      }

      .btn{
        border-radius: 16px;
        padding: 11px 12px;
        font-weight: 1000;
        border: 1px solid var(--stroke);
        background: rgba(0,0,0,.24);
        color: rgba(255,255,255,.96);
        cursor:pointer;
        transition: transform .12s ease, border-color .12s ease, opacity .12s ease, background .12s ease;
        line-height: 1.1;
      }
      .btn:hover:not(:disabled){
        transform: translateY(-1px);
        border-color: var(--stroke2);
        background: rgba(0,0,0,.30);
      }
      .btn:disabled{ opacity:.55; cursor:not-allowed; }

      .btn.ok{
        background: linear-gradient(180deg, rgba(34,197,94,.96), rgba(16,185,129,.86));
        color: rgba(10,10,10,.96);
        border-color: rgba(34,197,94,.30);
      }
      .btn.gold{
        background: linear-gradient(180deg, rgba(250,204,21,.96), rgba(245,158,11,.86));
        color: rgba(10,10,10,.96);
        border-color: rgba(245,158,11,.30);
      }
      .btn.danger{
        background: linear-gradient(180deg, rgba(239,68,68,.96), rgba(185,28,28,.86));
        border-color: rgba(239,68,68,.30);
      }
      .btn.ghost{ background: rgba(0,0,0,.24); }

      .callout{
        margin-top: 12px;
        border-radius: 18px;
        border: 1px solid var(--stroke);
        background: rgba(0,0,0,.22);
        padding: 12px;
        font-size: 13px;
        opacity: .92;
      }
      .callout.warn{
        border-color: rgba(245,158,11,.28);
        background: rgba(245,158,11,.10);
      }

      .hint{ margin-top: 10px; font-size: 12px; opacity: .75; }
      .small{ font-size: 12px; opacity: .75; }

      .field{ display:grid; gap: 8px; margin-top: 10px; }
      .field label{ font-size: 12px; opacity:.75; font-weight: 1000; }
      .field input, .field select{
        width:100%;
        border-radius: 16px;
        padding: 12px 12px;
        border: 1px solid var(--stroke);
        background: rgba(0,0,0,.34);
        outline:none;
        color: rgba(255,255,255,.96);
        line-height: 1.15;
      }
      .field input:focus, .field select:focus{
        border-color: rgba(255,220,140,.34);
        box-shadow: 0 0 0 3px rgba(255,180,90,.12);
      }

      .modalOverlay{
        position:fixed; inset:0; z-index:9999;
        background: rgba(0,0,0,.72);
        backdrop-filter: blur(10px);
        display:grid;
        place-items:center;
        padding: 16px;
      }
      .modal{
        width: min(760px, 96vw);
        border-radius: 22px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.07);
        box-shadow: 0 34px 110px rgba(0,0,0,.70);
        overflow:hidden;
      }
      .modalHead{
        padding: 16px;
        border-bottom: 1px solid rgba(255,255,255,.10);
        background:
          radial-gradient(900px circle at 20% 0%, rgba(255,200,120,.18), transparent 60%),
          rgba(0,0,0,.25);
      }
      .modalBadge{
        font-weight: 1000;
        letter-spacing: .14em;
        text-transform: uppercase;
        font-size: 12px;
        opacity: .86;
      }
      .modalTitle{
        margin-top: 6px;
        font-weight: 1000;
        font-size: 18px;
        letter-spacing: -0.02em;
      }
      .modalScore{ margin-top: 6px; font-size: 13px; opacity: .80; }
      .modalBody{ padding: 16px; display:grid; gap: 12px; }
      .row{ display:grid; gap: 4px; }
      .label{ font-weight: 1000; }
      .modalActions{ display:flex; flex-wrap:wrap; gap: 10px; padding-top: 6px; }

      /* ======== RESPONSIVE ======== */
      @media (max-width: 1200px){
        .hp2Grid{ grid-template-columns: 1fr 1fr; }
        .hp2Grid > .card:nth-child(2){ grid-column: 1 / -1; } /* Pregunta + respuestas full */
      }

      @media (max-width: 820px){
        .hp2Top{
          flex-direction: column;
          align-items: stretch;
        }
        .hp2Scores{ width: 100%; }
        .hp2Brand{ min-width: 0; }

        .hp2Grid{ grid-template-columns: 1fr; }
        .answers{ max-height: none; } /* en móvil mejor que crezca */
        .actions{
          display:grid;
          grid-template-columns: 1fr;
        }
        .btn{ width: 100%; } /* botones full */
        .turnRow{ grid-template-columns: 1fr; }
        .turnBtn{ padding: 12px; }
      }

      @media (max-width: 420px){
        .hp2Root{ padding: 10px; }
        .hp2Title{ font-size: 16px; }
        .badge{ padding: 7px 9px; font-size: 11px; }
        .card{ padding: 12px; }
        .idx{ width: 28px; height: 28px; border-radius: 10px; }
        .tag{ width: 32px; height: 32px; border-radius: 11px; }
      }
    `}</style>
  )
}

function ScorePill({
  tag,
  name,
  score,
  strikes,
  active,
}: {
  tag: 'A' | 'B'
  name: string
  score: number
  strikes: number
  active: boolean
}) {
  return (
    <div className={`sp ${active ? 'spOn' : ''}`}>
      <div className="spTag">{tag}</div>
      <div className="spMid">
        <div className="spName">{name}</div>
        <div className="spMini">{strikes ? `Taches: ${'X'.repeat(strikes)}` : 'Taches: 0'}</div>
      </div>
      <div className="spScore">{score}</div>

      <style jsx>{`
        .sp{
          display:flex;
          align-items:center;
          gap:10px;
          border-radius:18px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.22);
          padding: 10px 10px;
          min-width: 260px;
          box-shadow: 0 16px 44px rgba(0,0,0,.40);
          backdrop-filter: blur(10px);
        }
        .spOn{
          border-color: rgba(255,220,140,.34);
          box-shadow: 0 0 0 3px rgba(255,180,90,.10), 0 18px 52px rgba(0,0,0,.48);
        }
        .spTag{
          width:34px; height:34px; border-radius:12px;
          display:grid; place-items:center;
          font-weight:1000;
          color: rgba(20,8,2,.95);
          background: linear-gradient(180deg, rgba(255,200,120,.95), rgba(255,140,40,.92));
          flex: 0 0 auto;
        }
        .spMid{ min-width:0; flex:1; }
        .spName{
          font-weight:1000;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .spMini{ margin-top:2px; font-size:12px; opacity:.78; }
        .spScore{
          font-weight:1000;
          font-variant-numeric: tabular-nums;
          font-size: 22px;
          padding: 7px 12px;
          border-radius: 16px;
          background: rgba(255,255,255,.07);
          border: 1px solid rgba(255,255,255,.12);
          min-width: 64px;
          text-align:center;
        }

        @media (max-width: 820px){
          .sp{ min-width: 0; width: 100%; }
        }
      `}</style>
    </div>
  )
}
