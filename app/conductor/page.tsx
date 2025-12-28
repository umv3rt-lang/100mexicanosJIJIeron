// app/conductor/page.tsx
'use client'

import { GameProvider } from '@/src/components/GameProvider'
import HostPanel from '@/src/components/HostPanel'

export default function ConductorPage() {
  return (
    <GameProvider>
      <HostPanel />
    </GameProvider>
  )
}
