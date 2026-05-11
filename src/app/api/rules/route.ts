import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchCategoryRules, fetchPixRules } from '@/lib/google'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [rules, pixRules] = await Promise.all([fetchCategoryRules(), fetchPixRules()])
  return NextResponse.json({ rules, pixRules, loadedAt: new Date().toISOString() })
}
