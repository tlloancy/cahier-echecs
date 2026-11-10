/** Petits formateurs partagés par l'interface (sans accès au DOM, donc testables). */

export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function num(value: number): string {
  return value.toLocaleString('fr-FR')
}

/** « 1. e4 e5 2. Nf3 » à partir d'une liste de coups. */
export function formatLine(sans: string[]): string {
  return sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ')
}

/** Points perdus en « pions » (1 pion = 100 centipions) : « 3,2 ». */
export function pawns(centipawns: number): string {
  return (centipawns / 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Libellé lisible d'une perte : les pertes plafonnées (mat) s'affichent « mat ». */
export function lossLabel(centipawns: number, cap: number): string {
  return centipawns >= cap ? 'mat ou presque' : `−${pawns(centipawns)} pion${centipawns >= 200 ? 's' : ''}`
}

export function ago(timestamp: number, now = Date.now()): string {
  if (!timestamp) return ''
  const minutes = Math.round((now - timestamp) / 60000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 30) return `il y a ${days} jour${days > 1 ? 's' : ''}`
  return new Date(timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
