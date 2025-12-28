// src/lib/questionBank.ts
export type BankRound = {
  label: string
  multiplier: 1 | 2 | 3
  question: string
  answers: Array<{ text: string; points: number }>
}

// ✅ IMPORTA TU BANCO REAL AQUÍ
// Si tu archivo se llama distinto, ajusta el import:
import { QUESTION_BANK as RAW_BANK } from './questionBank_1000'

// ===== Helpers =====
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// multipliers tipo show: 1x primeras 5, 2x siguientes 3, 3x el resto
function multiplierForIndex(i: number): 1 | 2 | 3 {
  if (i < 5) return 1
  if (i < 8) return 2
  return 3
}

// normaliza texto para dedupe
function norm(s: string) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

// ✅ fuerza EXACTAMENTE 5 respuestas
function normalizeAnswers(items: Array<{ text: string; points: number }>) {
  const cleaned = (items || [])
    .map((x) => ({ text: String(x?.text ?? '').trim(), points: Number(x?.points ?? 0) }))
    .filter((x) => x.text.length > 0 && Number.isFinite(x.points) && x.points > 0)

  // Si venían más de 5: recorta a 5
  if (cleaned.length >= 5) return cleaned.slice(0, 5)

  // Si venían menos de 5: rellena con placeholders (para que NO rompa el UI)
  // (idealmente tu banco ya trae 5, pero esto evita crashes)
  const out = cleaned.slice()
  while (out.length < 5) out.push({ text: '—', points: 0 })
  return out
}

// ✅ dedupe por pregunta + asegura 5 respuestas
const QUESTION_BANK: BankRound[] = (() => {
  const seen = new Set<string>()
  const out: BankRound[] = []

  for (const q of RAW_BANK as BankRound[]) {
    const key = norm(q.question)
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)

    const answers = normalizeAnswers(q.answers)
    out.push({
      label: q.label || 'Ronda',
      multiplier: q.multiplier || 1,
      question: q.question,
      answers,
    })
  }
  return out
})()

// ===== Deck en memoria (no se repite en la sesión) =====
let _deck: BankRound[] | null = null
let _cursor = 0

function ensureDeck() {
  if (!_deck || _cursor >= _deck.length) {
    _deck = shuffle(QUESTION_BANK)
    _cursor = 0
  }
}

export function reshuffleDeck() {
  _deck = shuffle(QUESTION_BANK)
  _cursor = 0
}

/**
 * ✅ Devuelve N rondas aleatorias sin repetirse (en ese match).
 * También re-etiqueta label + multipliers por posición.
 */
export function pickGameRounds(count: number): BankRound[] {
  const n = Math.max(1, Math.floor(Number(count || 10)))

  const picked: BankRound[] = []
  while (picked.length < n) {
    ensureDeck()
    const remaining = (_deck!.length - _cursor)
    const take = Math.min(n - picked.length, remaining)
    picked.push(..._deck!.slice(_cursor, _cursor + take))
    _cursor += take
  }

  return picked.map((r, i) => ({
    ...r,
    label: `Ronda ${i + 1}`,
    multiplier: multiplierForIndex(i),
    answers: normalizeAnswers(r.answers), // ✅ doble seguro
  }))
}

// (opcional) si quieres exportar el banco ya “limpio”
export { QUESTION_BANK }
