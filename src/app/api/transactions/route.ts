import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/route'
import { saveTransactions, fetchTransactions, saveNewPixRule } from '@/lib/google'
import type { Transaction } from '@/lib/types'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mes = req.nextUrl.searchParams.get('mes') || ''
  const transactions = await fetchTransactions(mes)
  return NextResponse.json({ transactions })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { transactions, mes } = await req.json() as { transactions: Transaction[]; mes: string }
  const result = await saveTransactions(transactions, mes)
  return NextResponse.json(result)
}

export async function PUT(req: NextRequest) {
  // Save a new rule
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rule = await req.json()
  await saveNewPixRule(rule)
  return NextResponse.json({ ok: true })
}
