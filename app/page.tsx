'use client'

import { GameProvider, useGame } from '@/src/components/GameProvider'
import IntroSetupScreen from '@/src/components/IntroSetupScreen'
import BoardScreen from '@/src/components/BoardScreen'

function Router() {
  const { state } = useGame()
  if (!state) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Cargando…</div>
  return state.phase === 'SETUP' ? <IntroSetupScreen /> : <BoardScreen />
}

export default function Page() {
  return (
    <GameProvider>
      <Router />
    </GameProvider>
  )
}
