import { google } from 'googleapis'
import type { CategoryRule, PixRule, Transaction } from './types'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export async function readSheet(sheetId: string, range = 'A:Z'): Promise<string[][]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  })
  return (res.data.values as string[][]) || []
}

export async function appendRows(sheetId: string, rows: (string | number)[][], range = 'A:Z'): Promise<void> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  })
}

export async function fetchCategoryRules(): Promise<CategoryRule[]> {
  const rows = await readSheet(process.env.SHEET_REGRAS_ID!)
  return rows.slice(1).filter(r => r[0]).map(r => ({
    match: (r[0] || '').trim().toLowerCase(),
    categoria: (r[1] || '').trim(),
    natureza: (r[2] || '').trim(),
    fonte: (r[3] || '').trim().toLowerCase(),
  }))
}

export async function fetchPixRules(): Promise<PixRule[]> {
  const rows = await readSheet(process.env.SHEET_PIX_ID!)
  return rows.slice(1).filter(r => r[0]).map(r => ({
    match: (r[0] || '').trim().toLowerCase(),
    quem: (r[1] || '').trim(),
    categoria: (r[2] || '').trim(),
    natureza: (r[3] || '').trim(),
    pessoa: (r[4] || '').trim().toLowerCase(),
    acao: ((r[5] || 'classificar').trim().toLowerCase()) as 'classificar' | 'ignorar' | 'reembolso',
  }))
}

export async function fetchTransactions(mes: string): Promise<Transaction[]> {
  const rows = await readSheet(process.env.SHEET_LANCAMENTOS_ID!)
  return rows.slice(1)
    .filter(r => r[0] === mes)
    .map(r => ({
      id: `${r[2]}-${r[1]}-${r[3]}`,
      mes: r[0],
      data: r[1] || null,
      source: r[2],
      descricao: r[3],
      categoria: r[4],
      natureza: r[5] as 'casa' | 'pessoal',
      valor: parseFloat((r[6] || '0').replace(',', '.')),
      confianca: 'alta' as const,
    }))
}

function normalizeValor(v: string | undefined): string {
  return parseFloat((v || '0').replace(',', '.')).toFixed(2)
}

export async function saveTransactions(transactions: Transaction[], mes: string): Promise<{ saved: number; skipped: number }> {
  const existing = await readSheet(process.env.SHEET_LANCAMENTOS_ID!)
  const existingKeys = new Set(
    existing.slice(1).map(r => `${r[2]}|${(r[3] || '').toLowerCase()}|${normalizeValor(r[6])}|${r[1]}`)
  )

  const newRows: (string | number)[][] = []

  // Regular transactions
  const others = transactions.filter(tx => !(tx.source.startsWith('renata') && tx.natureza === 'pessoal'))
  for (const tx of others) {
    const key = `${tx.source}|${tx.descricao.toLowerCase()}|${tx.valor.toFixed(2)}|${tx.data || ''}`
    if (existingKeys.has(key)) continue
    newRows.push([mes, tx.data || '', tx.source, tx.descricao, tx.categoria, tx.natureza, tx.valor])
  }

  // Renata pessoal — only total
  const renataPessoal = transactions.filter(tx => tx.source.startsWith('renata') && tx.natureza === 'pessoal')
  if (renataPessoal.length > 0) {
    const total = renataPessoal.reduce((s, t) => s + t.valor, 0)
    const key = `renata|gastos pessoais renata (privado)|${total.toFixed(2)}|`
    if (!existingKeys.has(key)) {
      newRows.push([mes, '', 'renata', 'Gastos pessoais Renata (privado)', 'Pessoal', 'pessoal', total])
    }
  }

  if (newRows.length > 0) {
    await appendRows(process.env.SHEET_LANCAMENTOS_ID!, newRows)
  }

  return { saved: newRows.length, skipped: transactions.length - newRows.length }
}

export async function saveNewPixRule(rule: Omit<PixRule, 'acao'> & { acao: string }): Promise<void> {
  await appendRows(process.env.SHEET_PIX_ID!, [[
    rule.match, rule.quem, rule.categoria, rule.natureza, rule.pessoa, rule.acao, 'Aprendido automaticamente'
  ]])
}
