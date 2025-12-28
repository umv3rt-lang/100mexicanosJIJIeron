'use client'

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { BoardState, GameCtx, HostAction } from '@/src/lib/gameTypes'

const Ctx = createContext<GameCtx | null>(null)

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001'

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BoardState | null>(null)
  const [connected, setConnected] = useState(false)
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ['websocket'] })
    setSocket(s)

    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    const onState = (next: BoardState) => setState(next)

    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    s.on('board:state', onState)

    // pide estado inicial
    s.emit('board:get')

    return () => {
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
      s.off('board:state', onState)
      s.disconnect()
    }
  }, [])

  const send = useCallback(
    (action: HostAction) => {
      if (!socket) return
      socket.emit('host:action', action)
    },
    [socket]
  )

  const value = useMemo<GameCtx>(
    () => ({
      state,
      connected,
      send,
      dispatch: send,
    }),
    [state, connected, send]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGame() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useGame debe usarse dentro de <GameProvider>')
  return ctx
}
