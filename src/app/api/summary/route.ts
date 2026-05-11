import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchTransactions } from '@/lib/google'
import { RAFAEL_SHARE, RENATA_SHARE, getCat } from '@/lib/types'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mes = req.nextUrl.searchParams.get('mes') || ''
  const transactions = await fetchTransactions(mes)

  const gastos = transactions.filter(t => t.valor > 0)
  const totalCasa = gastos.filter(t => t.natureza === 'casa').reduce((s, t) => s + t.valor, 0)
  const totalPessoal = gastos.filter(t => t.natureza === 'pessoal').reduce((s, t) => s + t.valor, 0)
  const totalReembolsos = Math.abs(transactions.filter(t => t.valor < 0).reduce((s, t) => s + t.valor, 0))

  const rafaelPagou = transactions.filter(t => t.natureza === 'casa' && t.source.startsWith('rafael') && t.valor > 0).reduce((s, t) => s + t.valor, 0)
  const renataPagou = transactions.filter(t => t.natureza === 'casa' && t.source.startsWith('renata') && t.valor > 0).reduce((s, t) => s + t.valor, 0)
  const casaPagou = transactions.filter(t => t.natureza === 'casa' && t.source.startsWith('casa') && t.valor > 0).reduce((s, t) => s + t.valor, 0)

  const rafaelAcerto = totalCasa * RAFAEL_SHARE - rafaelPagou - casaPagou * RAFAEL_SHARE
  const renataAcerto = totalCasa * RENATA_SHARE - renataPagou - casaPagou * RENATA_SHARE

  const byCategory: Record<string, number> = {}
  gastos.forEach(tx => {
    if (!byCategory[tx.categoria]) byCategory[tx.categoria] = 0
    byCategory[tx.categoria] += tx.valor
  })

  const viagemGastos = transactions.filter(t => t.categoria === 'viagem_trabalho' && t.valor > 0).reduce((s, t) => s + t.valor, 0)
  const viagemReemb = Math.abs(transactions.filter(t => t.categoria === 'viagem_trabalho' && t.valor < 0).reduce((s, t) => s + t.valor, 0))

  return NextResponse.json({
    totalCasa,
    totalPessoal,
    totalReembolsos,
    totalGastos: totalCasa + totalPessoal,
    rafaelDeve: totalCasa * RAFAEL_SHARE,
    renataDeve: totalCasa * RENATA_SHARE,
    rafaelAcerto,
    renataAcerto,
    byCategory: Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([id, total]) => ({ id, label: getCat(id)?.label || id, icon: getCat(id)?.icon || '?', total })),
    viagem: { gastos: viagemGastos, reembolsos: viagemReemb, liquido: viagemGastos - viagemReemb },
  })
}
