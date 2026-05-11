import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { classifyBatch } from '@/lib/anthropic'
import { preClassifyLines, filterLinesByDate } from '@/lib/rules'
import { fetchCategoryRules, fetchPixRules } from '@/lib/google'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, source, filter, cachedRules } = await req.json()
  if (!text || !source) return NextResponse.json({ error: 'text and source required' }, { status: 400 })

  // Use cached rules or fetch fresh
  const rules = cachedRules?.rules || await fetchCategoryRules()
  const pixRules = cachedRules?.pixRules || await fetchPixRules()

  // Filter lines by date if needed
  const allLines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 3)
  const lines = filter ? filterLinesByDate(allLines, filter) : allLines

  // Pre-classify with rules
  const { classified: preClassified, unmatched } = preClassifyLines(lines, pixRules, rules, source)

  // AI classify unmatched in batches
  const aiResults = []
  const BATCH = 25
  for (let i = 0; i < unmatched.length; i += BATCH) {
    const batch = unmatched.slice(i, i + BATCH).join('\n')
    const results = await classifyBatch([batch], source)
    aiResults.push(...results)
  }

  const all = [...preClassified, ...aiResults]

  return NextResponse.json({
    transactions: all,
    stats: {
      total: all.length,
      byRules: preClassified.length,
      byAI: aiResults.length,
      filtered: allLines.length - lines.length,
    }
  })
}
