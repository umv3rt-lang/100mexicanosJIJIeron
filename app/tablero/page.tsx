// app/tablero/page.tsx
'use client'

import { GameProvider } from '@/src/components/GameProvider'
import BoardScreen from '@/src/components/BoardScreen'

export default function TableroPage() {
  return (
    <GameProvider>
      <BoardScreen />
    </GameProvider>
  )
}
