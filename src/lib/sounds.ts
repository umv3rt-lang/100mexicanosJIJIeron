/* src/lib/sounds.ts
   ✅ playSound(key, opts?) -> devuelve duración en ms (number)
   ✅ NO crea Audio en import (evita problemas SSR/Next)
   ✅ cache de audios, soporte restart/volume
*/

export type SoundKey =
  | 'intro'
  | 'ajugar'
  | 'correcto'
  | 'incorrecto'
  | 'ronda'
  | 'triunfo'
  | 'buzzer'
  | 'tick'

type PlayOpts = {
  restart?: boolean
  volume?: number // 0..1
}

const SOUND_FILES: Record<SoundKey, string> = {
  intro: '/intro.mp3',
  ajugar: '/ajugar.mp3',
  correcto: '/correcto.mp3',
  incorrecto: '/incorrecto.mp3',
  ronda: '/ronda.mp3',
  triunfo: '/triunfo.mp3',
  buzzer: '/buzzer.mp3',
  tick: '/tick.mp3',
}

const audioCache = new Map<SoundKey, HTMLAudioElement>()
const metaReady = new Map<SoundKey, Promise<void>>()

function isBrowser() {
  return typeof window !== 'undefined' && typeof Audio !== 'undefined'
}

function getAudio(key: SoundKey) {
  let a = audioCache.get(key)
  if (!a) {
    a = new Audio(SOUND_FILES[key])
    a.preload = 'auto'
    a.loop = false
    a.volume = 1
    audioCache.set(key, a)
  }
  return a
}

async function ensureMetaLoaded(key: SoundKey) {
  if (metaReady.has(key)) return metaReady.get(key)!

  const p = new Promise<void>((resolve) => {
    const a = getAudio(key)

    // Si ya está lista la metadata, resolvemos
    if (Number.isFinite(a.duration) && a.duration > 0) {
      resolve()
      return
    }

    const done = () => {
      a.removeEventListener('loadedmetadata', done)
      a.removeEventListener('canplaythrough', done)
      resolve()
    }

    a.addEventListener('loadedmetadata', done, { once: true })
    a.addEventListener('canplaythrough', done, { once: true })

    // Por si el navegador no dispara eventos de inmediato:
    // forzamos cargar
    try {
      a.load()
    } catch {
      // ignore
    }
  })

  metaReady.set(key, p)
  return p
}

/**
 * ✅ Reproduce un sonido y devuelve su duración en ms.
 * - opts.restart: reinicia a 0 antes de reproducir
 * - opts.volume: volumen 0..1
 */
export async function playSound(key: SoundKey, opts?: PlayOpts): Promise<number> {
  if (!isBrowser()) return 0

  const a = getAudio(key)

  // volumen
  if (typeof opts?.volume === 'number' && Number.isFinite(opts.volume)) {
    a.volume = Math.max(0, Math.min(1, opts.volume))
  }

  // restart
  if (opts?.restart) {
    try {
      a.pause()
      a.currentTime = 0
    } catch {
      // ignore
    }
  } else {
    // si está sonando, lo reiniciamos suave para que no se empalme
    if (!a.paused) {
      try {
        a.pause()
        a.currentTime = 0
      } catch {
        // ignore
      }
    }
  }

  // intentamos asegurar metadata para saber duración
  try {
    await ensureMetaLoaded(key)
  } catch {
    // ignore
  }

  // play
  try {
    await a.play()
  } catch {
    // autoplay bloqueado o similar
    // devolvemos fallback con duración si se conoce
  }

  const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0
  return Math.round(dur * 1000)
}

/** Opcional: detener un sonido específico */
export function stopSound(key: SoundKey) {
  if (!isBrowser()) return
  const a = audioCache.get(key)
  if (!a) return
  try {
    a.pause()
    a.currentTime = 0
  } catch {
    // ignore
  }
}

/** Opcional: precargar (para evitar delay en el primer play) */
export async function preloadSounds(keys: SoundKey[] = Object.keys(SOUND_FILES) as SoundKey[]) {
  if (!isBrowser()) return
  await Promise.all(
    keys.map(async (k) => {
      try {
        const a = getAudio(k)
        a.load()
        await ensureMetaLoaded(k)
      } catch {
        // ignore
      }
    }),
  )
}
