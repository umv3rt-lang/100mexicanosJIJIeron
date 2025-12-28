'use client'

import { useMemo, useState } from 'react'
import { useGame } from './GameProvider'
import type { TeamId } from '@/src/lib/gameTypes'

export default function HostPanel() {
  const { state, dispatch } = useGame()
  const [challengerName, setChallengerName] = useState('Retador')

  const roundBank = useMemo(() => state?.roundBank ?? 0, [state?.roundBank])

  // ✅ Solo respuestas con texto (pero guardando el índice original para reveal)
  const displayAnswers = useMemo(() => {
    const list = state?.current?.answers ?? []
    return list
      .map((a: any, originalIndex: number) => ({ ...a, __idx: originalIndex }))
      .filter((a: any) => (a?.text ?? '').trim().length > 0)
  }, [state?.current?.answers])

  if (!state) return null

  const isSteal = state.phase === 'STEAL'
  const isPostReveal = state.phase === 'POST_REVEAL'

  const winnerTeam: TeamId | null = state.winner === 'A' || state.winner === 'B' ? state.winner : null
  const loserTeam: TeamId | null = winnerTeam ? (winnerTeam === 'A' ? 'B' : 'A') : null

  const activeName = state.turnTeam === 'A' ? state.teams.A.name : state.teams.B.name

  const reveal = (i: number) => dispatch({ type: 'REVEAL', index: i } as any)
  const strike = () => dispatch({ type: 'STRIKE_ADD' } as any)
  const clearStrikes = () => dispatch({ type: 'STRIKE_CLEAR' } as any)
  const nextRound = () => dispatch({ type: 'NEXT_ROUND' } as any)
  const setTurn = (team: TeamId) => dispatch({ type: 'SET_TURN_TEAM', team } as any)
  const stealSuccess = () => dispatch({ type: 'STEAL_RESOLVE', success: true } as any)
  const stealFail = () => dispatch({ type: 'STEAL_RESOLVE', success: false } as any)

  const winnerText =
    state.winner === 'A'
      ? `🏆 Ganó: ${state.teams.A.name}`
      : state.winner === 'B'
        ? `🏆 Ganó: ${state.teams.B.name}`
        : state.winner === 'TIE'
          ? '🤝 Empate (muerte súbita)'
          : 'Fin'

  // ✅ RETADOR sin reset a Intro:
  // - NO usamos CHALLENGER_YES
  // - Reemplazamos SOLO al perdedor
  // - START_MATCH directo
  const applyChallengerAndStart = () => {
    if (!winnerTeam || !loserTeam) return
    const name = (challengerName || '').trim() || 'Retador'

    const nextA = loserTeam === 'A' ? name : state.teams.A.name
    const nextB = loserTeam === 'B' ? name : state.teams.B.name

    dispatch({ type: 'SET_TEAMS', teamA: nextA, teamB: nextB } as any)
    dispatch({ type: 'START_MATCH' } as any)
  }

  const askNewNames = () => {
    dispatch({ type: 'CHALLENGER_NO' } as any)
  }

  const showFinishModal = state.phase === 'FINISHED' && !!state.awaitingChallengerDecision

  return (
    <div className="hp2Root">
      {/* Top bar */}
      <div className="hp2Top">
        <div className="hp2Brand">
          <div className="hp2Title">🎛️ Control del Conductor</div>
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

      {/* Main grid */}
      <div className="hp2Grid">
        {/* Left: turn + actions */}
        <div className="card">
          <div className="cardTitle">Turno</div>

          <div className="turnRow">
            <button
              className={`turnBtn ${state.turnTeam === 'A' ? 'turnBtnOn' : ''}`}
              onClick={() => setTurn('A')}
              disabled={isSteal}
              type="button"
            >
              <span className="tag">A</span>
              <span className="name">{state.teams.A.name}</span>
              <span className="mini">{state.teams.A.strikes ? 'X'.repeat(state.teams.A.strikes) : ''}</span>
            </button>

            <button
              className={`turnBtn ${state.turnTeam === 'B' ? 'turnBtnOn' : ''}`}
              onClick={() => setTurn('B')}
              disabled={isSteal}
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
            <button className="btn danger" onClick={strike} disabled={isSteal || isPostReveal} type="button">
              ❌ Tache (en turno)
            </button>
            <button className="btn ghost" onClick={clearStrikes} type="button">
              🧼 Limpiar taches
            </button>
            <button className="btn gold" onClick={nextRound} disabled={isSteal} type="button">
              ▶ Siguiente ronda
            </button>
          </div>

          {isPostReveal && (
            <div className="callout">
              ✅ Robo resuelto. Revela lo restante <b>una por una</b> sin sumar puntos y luego pasa a la siguiente ronda.
            </div>
          )}
        </div>

        {/* Center: question */}
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
                onClick={() => reveal(a.__idx)} // ✅ índice real
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

        {/* Right: steal panel */}
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

      {/* FINISH MODAL */}
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
                <button className="btn ok" onClick={applyChallengerAndStart} type="button">
                  ✅ Sí hay retador (iniciar)
                </button>
                <button className="btn ghost" onClick={askNewNames} type="button">
                  ❌ No hay retador (pedir nombres)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .hp2Root{
          min-height:100vh;
          padding:16px;
          color:#fff;
          background:
            radial-gradient(1000px circle at 15% 0%, rgba(255,180,90,.12), transparent 60%),
            radial-gradient(900px circle at 90% 30%, rgba(255,120,40,.10), transparent 60%),
            linear-gradient(180deg, #060608, #0b0b10);
          display:grid;
          gap:12px;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        }

        .hp2Top{
          border:1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.04);
          border-radius:18px;
          padding:14px;
          backdrop-filter: blur(10px);
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
        }

        .hp2Title{ font-weight:1000; letter-spacing:-.02em; font-size:18px; }
        .hp2Meta{ margin-top:6px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }

        .badge{
          border-radius:999px;
          padding:8px 10px;
          font-size:12px;
          font-weight:900;
          border:1px solid rgba(255,255,255,.14);
          background: rgba(0,0,0,.25);
          opacity:.95;
        }
        .badge b{ color: rgba(255,255,255,.98); }
        .badge.gold{ border-color: rgba(245,158,11,.35); background: rgba(245,158,11,.12); }
        .badge.ok{ border-color: rgba(34,197,94,.35); background: rgba(34,197,94,.12); }
        .badge.warn{ border-color: rgba(245,158,11,.35); background: rgba(245,158,11,.12); }
        .badge.ghost{ opacity:.7; }

        .hp2Scores{ display:flex; gap:10px; flex-wrap:wrap; }

        .hp2Grid{
          display:grid;
          grid-template-columns: 360px 1fr 360px;
          gap:12px;
          align-items:start;
        }

        .card{
          border-radius:18px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.04);
          padding:14px;
          backdrop-filter: blur(10px);
        }

        .cardTitle{
          font-size:12px;
          opacity:.75;
          font-weight:900;
          letter-spacing:.10em;
          text-transform:uppercase;
        }

        .divider{
          height:1px;
          background: rgba(255,255,255,.10);
          margin:12px 0;
        }

        .turnRow{ margin-top:10px; display:grid; gap:10px; }
        .turnBtn{
          border-radius:16px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.25);
          padding:12px;
          display:flex;
          align-items:center;
          gap:10px;
          font-weight:900;
          cursor:pointer;
          transition: transform .12s ease, border-color .12s ease;
        }
        .turnBtn:disabled{ opacity:.55; cursor:not-allowed; }
        .turnBtn:hover:not(:disabled){ transform: translateY(-1px); border-color: rgba(255,255,255,.22); }
        .turnBtnOn{ border-color: rgba(255,220,140,.35); box-shadow: 0 0 22px rgba(255,170,70,.10); }

        .tag{
          width:34px; height:34px; border-radius:12px;
          display:grid; place-items:center;
          color: rgba(25,8,2,.95);
          background: linear-gradient(180deg, rgba(255,220,140,.95), rgba(255,140,40,.92));
          flex:0 0 auto;
        }
        .name{ flex:1; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .mini{ opacity:.9; }

        .question{
          margin-top:10px;
          font-weight:1000;
          letter-spacing:-.02em;
          font-size:16px;
          line-height:1.25;
        }

        .answers{ margin-top:10px; display:grid; gap:8px; max-height: 64vh; overflow:auto; padding-right:8px; }
        .answerBtn{
          width:100%;
          text-align:left;
          border-radius:16px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.24);
          padding:12px;
          cursor:pointer;
          display:grid;
          gap:6px;
          transition: transform .12s ease, border-color .12s ease;
        }
        .answerBtn:hover{ transform: translateY(-1px); border-color: rgba(255,255,255,.22); }
        .answerOn{ border-color: rgba(34,197,94,.35); background: rgba(34,197,94,.08); }

        .answerLeft{ display:flex; gap:10px; align-items:center; min-width:0; }
        .idx{
          width:30px; height:30px; border-radius:10px;
          display:grid; place-items:center;
          color: rgba(25,8,2,.95);
          background: linear-gradient(180deg, rgba(255,220,140,.95), rgba(255,140,40,.92));
          flex:0 0 auto;
          font-weight:1000;
        }
        .txt{ font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:.95; }
        .answerRight{ display:flex; justify-content:space-between; align-items:center; opacity:.9; font-weight:900; }
        .pts{ font-variant-numeric: tabular-nums; }
        .ok{ width:24px; text-align:right; }
        .subnote{ font-size:12px; opacity:.65; }

        .actions{ margin-top:10px; display:flex; flex-wrap:wrap; gap:10px; }

        .btn{
          border-radius:14px;
          padding:10px 12px;
          font-weight:1000;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.25);
          color: rgba(255,255,255,.95);
          cursor:pointer;
          transition: transform .12s ease, border-color .12s ease, opacity .12s ease;
        }
        .btn:hover{ transform: translateY(-1px); border-color: rgba(255,255,255,.22); }
        .btn:disabled{ opacity:.55; cursor:not-allowed; }

        .btn.ok{
          background: linear-gradient(180deg, rgba(34,197,94,.95), rgba(16,185,129,.85));
          color: rgba(10,10,10,.95);
          border-color: rgba(34,197,94,.35);
        }
        .btn.gold{
          background: linear-gradient(180deg, rgba(250,204,21,.95), rgba(245,158,11,.88));
          color: rgba(10,10,10,.95);
          border-color: rgba(245,158,11,.35);
        }
        .btn.danger{
          background: linear-gradient(180deg, rgba(239,68,68,.95), rgba(185,28,28,.85));
          border-color: rgba(239,68,68,.35);
        }
        .btn.ghost{ background: rgba(0,0,0,.25); }

        .callout{
          margin-top:10px;
          border-radius:16px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.22);
          padding:12px;
          font-size:13px;
          opacity:.9;
        }
        .callout.warn{
          border-color: rgba(245,158,11,.30);
          background: rgba(245,158,11,.10);
        }
        .hint{ margin-top:10px; font-size:12px; opacity:.75; }

        .modalOverlay{
          position:fixed; inset:0; z-index:9999;
          background: rgba(0,0,0,.72);
          backdrop-filter: blur(8px);
          display:grid;
          place-items:center;
          padding:16px;
        }
        .modal{
          width: min(720px, 96vw);
          border-radius:22px;
          border:1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          box-shadow: 0 30px 90px rgba(0,0,0,.6);
          overflow:hidden;
        }
        .modalHead{
          padding:16px;
          border-bottom:1px solid rgba(255,255,255,.10);
          background:
            radial-gradient(800px circle at 20% 0%, rgba(255,200,120,.16), transparent 60%),
            rgba(0,0,0,.25);
        }
        .modalBadge{
          font-weight:1000;
          letter-spacing:.12em;
          text-transform:uppercase;
          font-size:12px;
          opacity:.85;
        }
        .modalTitle{
          margin-top:6px;
          font-weight:1000;
          font-size:18px;
          letter-spacing:-.02em;
        }
        .modalScore{ margin-top:6px; font-size:13px; opacity:.8; }
        .modalBody{ padding:16px; display:grid; gap:12px; }
        .row{ display:grid; gap:4px; }
        .label{ font-weight:1000; }
        .small{ font-size:12px; opacity:.75; }
        .field{ display:grid; gap:8px; }
        .field label{ font-size:12px; opacity:.75; font-weight:900; }
        .field input{
          width:100%;
          border-radius:14px;
          padding:10px 12px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.35);
          outline:none;
          color: rgba(255,255,255,.95);
        }
        .field input:focus{
          border-color: rgba(255,220,140,.34);
          box-shadow: 0 0 0 3px rgba(255,180,90,.12);
        }
        .modalActions{ display:flex; flex-wrap:wrap; gap:10px; padding-top:6px; }

        @media (max-width: 1100px){
          .hp2Grid{ grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
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
          border-radius:16px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.22);
          padding:10px 10px;
          min-width: 260px;
        }
        .spOn{
          border-color: rgba(255,220,140,.35);
          box-shadow: 0 0 22px rgba(255,170,70,.10);
        }
        .spTag{
          width:34px; height:34px; border-radius:12px;
          display:grid; place-items:center;
          font-weight:1000;
          color: rgba(25,8,2,.95);
          background: linear-gradient(180deg, rgba(255,220,140,.95), rgba(255,140,40,.92));
        }
        .spMid{ min-width:0; flex:1; }
        .spName{
          font-weight:1000;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .spMini{ margin-top:2px; font-size:12px; opacity:.75; }
        .spScore{
          font-weight:1000;
          font-variant-numeric: tabular-nums;
          font-size: 22px;
          padding: 6px 10px;
          border-radius: 14px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
          min-width: 64px;
          text-align:center;
        }
      `}</style>
    </div>
  )
}
