import type { CategoryRule, PixRule } from './types'

export function applyPixRule(pixRules: PixRule[], line: string, source: string): PixRule | null {
  const desc = line.toLowerCase()
  const pessoa = source.split('_')[0]
  return (
    pixRules.find(r => desc.includes(r.match) && (r.pessoa === pessoa || r.pessoa === 'qualquer')) ||
    pixRules.find(r => desc.includes(r.match)) ||
    null
  )
}

export function applyCategoryRule(rules: CategoryRule[], line: string, source: string): CategoryRule | null {
  const desc = line.toLowerCase()
  const pessoa = source.split('_')[0]
  return (
    rules.find(r => desc.includes(r.match) && (r.fonte === pessoa || r.fonte === 'qualquer')) ||
    rules.find(r => desc.includes(r.match)) ||
    null
  )
}

export function parseDate(str: string): Date | null {
  if (!str) return null
  const parts = str.trim().split('/')
  if (parts.length < 2) return null
  const day = parseInt(parts[0])
  const month = parseInt(parts[1])
  const year = parts[2]
    ? parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2])
    : new Date().getFullYear()
  if (isNaN(day) || isNaN(month)) return null
  return new Date(year, month - 1, day)
}

export function filterLinesByDate(lines: string[], filter: { from?: string; to?: string }): string[] {
  if (!filter.from && !filter.to) return lines
  const from = filter.from ? parseDate(filter.from) : null
  const to = filter.to ? parseDate(filter.to) : null
  return lines.filter(line => {
    const m = line.match(/\b(\d{2}\/\d{2}(?:\/(?:\d{2}|\d{4}))?)\b/)
    if (!m) return true
    const d = parseDate(m[1])
    if (!d) return true
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  })
}

export interface PreClassifiedTx {
  descricao: string
  valor: number
  data: string | null
  categoria: string
  natureza: string
  confianca: 'alta' | 'baixa'
  fromPix?: boolean
  fromRule?: boolean
  isReembolso?: boolean
}

const PAYMENT_KEYWORDS = [
  'pagamento efetuado',
  'pagto fatura',
  'pagamento fatura',
  'debito automatico fatura',
]

export function preClassifyLines(
  lines: string[],
  pixRules: PixRule[],
  categoryRules: CategoryRule[],
  source: string
): { classified: PreClassifiedTx[]; unmatched: string[] } {
  const classified: PreClassifiedTx[] = []
  const unmatched: string[] = []

  for (const line of lines) {
    if (PAYMENT_KEYWORDS.some(k => line.toLowerCase().includes(k))) continue
    const vm = line.match(/(-?[\d]+[.,][\d]{2})$/)
    const valor = vm ? parseFloat(vm[0].replace(',', '.')) : 0
    if (valor === 0) continue

    const dm = line.match(/\b(\d{2}\/\d{2})\b/)
    const descricao = line.replace(/-?[\d.,]+$/, '').trim()

    // Pix rules first
    const pix = applyPixRule(pixRules, line, source)
    if (pix) {
      if (pix.acao === 'ignorar') continue
      const finalValor = pix.acao === 'reembolso' ? -Math.abs(valor) : valor
      classified.push({
        descricao: pix.quem || descricao,
        valor: finalValor,
        data: dm ? dm[1] : null,
        categoria: pix.categoria,
        natureza: pix.natureza,
        confianca: 'alta',
        fromPix: true,
        isReembolso: pix.acao === 'reembolso' || finalValor < 0,
      })
      continue
    }

    // Category rules
    const rule = applyCategoryRule(categoryRules, line, source)
    if (rule) {
      classified.push({
        descricao,
        valor,
        data: dm ? dm[1] : null,
        categoria: rule.categoria,
        natureza: rule.natureza,
        confianca: 'alta',
        fromRule: true,
        isReembolso: valor < 0,
      })
      continue
    }

    unmatched.push(line)
  }

  return { classified, unmatched }
}
