import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  'https://one00mexicanosjijieron.onrender.com' // fallback

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket'],
      withCredentials: true,
    })
  }
  return socket
}
