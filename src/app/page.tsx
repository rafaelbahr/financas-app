'use client'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { CATEGORIES, ALL_CATS, SOURCES, INCOME_TYPES, fmt, getCat } from '@/lib/types'
import type { Transaction, Income, RulesCache } from '@/lib/types'

// ---- Helpers ----
const now = new Date()
const defaultMonth = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`

// ---- Sub-components ----
function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    casa: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
    pessoal: 'bg-sky-900/40 text-sky-300 border border-sky-700/50',
    rafael: 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/50',
    renata: 'bg-rose-900/40 text-rose-300 border border-rose-700/50',
  }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[color] || 'bg-zinc-800 text-zinc-300'}`}>{children}</span>
}

function ProgressPanel({ steps }: { steps: { step: string; status: string; detail: string }[] }) {
  if (!steps.length) return null
  const icons: Record<string, string> = { pending: '⏳', done: '✓', error: '✗' }
  const colors: Record<string, string> = { pending: 'text-amber-400', done: 'text-emerald-400', error: 'text-red-400' }
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 space-y-2">
      <div className="text-xs text-zinc-500 uppercase tracking-wider">Progresso</div>
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className={`text-xs mt-0.5 ${colors[s.status]}`}>{icons[s.status]}</span>
          <div>
            <span className={`text-xs font-medium ${s.status === 'pending' ? 'text-zinc-300 animate-pulse' : 'text-zinc-400'}`}>{s.step}</span>
            {s.detail && <span className="text-xs text-zinc-600 ml-2">{s.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function TransactionRow({ tx, index, onUpdate, onDelete }: { tx: Transaction; index: number; onUpdate: (i: number, tx: Transaction) => void; onDelete: (i: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [savingRule, setSavingRule] = useState(false)
  const [ruleSaved, setRuleSaved] = useState(false)
  const cat = getCat(tx.categoria)

  const handleSaveRule = async () => {
    setSavingRule(true)
    await fetch('/api/transactions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match: tx.descricao.split(' ')[0].toLowerCase(), quem: tx.descricao, categoria: tx.categoria, natureza: tx.natureza, pessoa: tx.source.split('_')[0], acao: 'classificar' }),
    })
    setSavingRule(false)
    setRuleSaved(true)
    setEditing(false)
    setTimeout(() => setRuleSaved(false), 3000)
  }

  return (
    <div className={`group flex flex-col gap-1 px-4 py-3 rounded-xl border transition-all ${tx.confianca === 'baixa' ? 'border-amber-700/40 bg-amber-950/20' : 'border-zinc-800/60 bg-zinc-900/40 hover:bg-zinc-800/40'}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-200 truncate">{tx.descricao}</span>
            {tx.data && <span className="text-xs text-zinc-500">{tx.data}</span>}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge color={tx.natureza}>{tx.natureza === 'casa' ? '🏠 Casa' : '👤 Pessoal'}</Badge>
            {cat && <span className="text-xs text-zinc-500">{cat.icon} {cat.label}</span>}
            {tx.fromPix && <span className="text-xs text-indigo-400">📋 Pix</span>}
            {tx.fromRule && !tx.fromPix && <span className="text-xs text-zinc-600">⚡ Regra</span>}
            {tx.confianca === 'baixa' && <span className="text-xs text-amber-400">⚠ revisar</span>}
            {tx.isReembolso && <span className="text-xs text-emerald-500">↩ Reembolso</span>}
          </div>
        </div>
        <div className={`text-sm font-semibold ${tx.valor < 0 ? 'text-emerald-400' : 'text-zinc-100'}`}>{fmt(tx.valor)}</div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(!editing)} className="text-xs px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400">✎</button>
          <button onClick={() => onDelete(index)} className="text-xs px-2 py-1 rounded-lg bg-zinc-800 hover:bg-red-900/50 text-zinc-400 hover:text-red-400">✕</button>
        </div>
      </div>
      {editing && (
        <div className="flex gap-2 flex-wrap mt-1">
          <select value={tx.natureza} onChange={e => onUpdate(index, { ...tx, natureza: e.target.value as 'casa' | 'pessoal' })} className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-300">
            <option value="casa">Casa</option>
            <option value="pessoal">Pessoal</option>
          </select>
          <select value={tx.categoria} onChange={e => onUpdate(index, { ...tx, categoria: e.target.value })} className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-300">
            <optgroup label="🏠 Casa">{CATEGORIES.casa.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
            <optgroup label="👤 Pessoal">{CATEGORIES.pessoal.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
            <optgroup label="💰 Financeiro">{CATEGORIES.financeiro.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
          </select>
          <button onClick={handleSaveRule} className="text-xs px-3 py-1 rounded-lg bg-indigo-800 hover:bg-indigo-700 text-indigo-200">{savingRule ? 'Salvando...' : '💾 Salvar regra'}</button>
          <button onClick={() => setEditing(false)} className="text-xs px-3 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-200">OK</button>
        </div>
      )}
      {ruleSaved && <div className="text-xs text-indigo-400">✓ Regra salva</div>}
    </div>
  )
}

// ---- Main App ----
export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tab, setTab] = useState('import')
  const [activeSource, setActiveSource] = useState('rafael_cartao')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ step: string; status: string; detail: string }[]>([])
  const [rulesCache, setRulesCache] = useState<RulesCache | null>(null)
  const [loadingRules, setLoadingRules] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [loadedMonth, setLoadedMonth] = useState('')
  const [month, setMonth] = useState(defaultMonth)

  // Import form state
  const [importText, setImportText] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfProgress, setPdfProgress] = useState('')
  const [pdfInfo, setPdfInfo] = useState<{ tipo: string; titular: string; periodo: string; totalTransacoes: number } | null>(null)

  // Income form state
  const [incomePessoa, setIncomePessoa] = useState<'rafael' | 'renata'>('rafael')
  const [incomeTipo, setIncomeTipo] = useState('salario')
  const [incomeValor, setIncomeValor] = useState('')
  const [incomeData, setIncomeData] = useState('')

  // Reimburse form state
  const [reimbDesc, setReimbDesc] = useState('Reembolso empresa')
  const [reimbValor, setReimbValor] = useState('')
  const [reimbData, setReimbData] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const loadTransactions = useCallback(async (mes: string) => {
    setLoadingData(true)
    try {
      const res = await fetch(`/api/transactions?mes=${encodeURIComponent(mes)}`)
      if (!res.ok) return
      const data = await res.json()
      setTransactions(data.transactions || [])
      setLoadedMonth(mes)
    } catch {
      // silently fail — user can import manually
    } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') loadTransactions(defaultMonth)
  }, [status, loadTransactions])

  const navigateMonth = useCallback(() => {
    if (!/^\d{2}\/\d{4}$/.test(month)) return
    loadTransactions(month)
  }, [month, loadTransactions])

  const activeSourceObj = SOURCES.find(s => s.id === activeSource)
  const isRenata = activeSourceObj?.pessoa === 'renata'
  const sourceTxs = transactions.filter(tx => tx.source === activeSource)
  const ruleCount = (rulesCache?.rules?.length || 0) + (rulesCache?.pixRules?.length || 0)

  const addProgress = useCallback((step: string, status: string, detail = '') => {
    setProgress(prev => {
      const idx = prev.findIndex(p => p.step === step)
      const item = { step, status, detail }
      if (idx >= 0) { const next = [...prev]; next[idx] = item; return next }
      return [...prev, item]
    })
  }, [])

  const loadRules = useCallback(async () => {
    setLoadingRules(true)
    try {
      const res = await fetch('/api/rules')
      const data = await res.json()
      setRulesCache(data)
    } catch {
      setRulesCache({ rules: [], pixRules: [], loadedAt: new Date().toISOString() })
    } finally {
      setLoadingRules(false)
    }
  }, [])

  const handlePdfUpload = useCallback(async (file: File) => {
    setPdfLoading(true)
    setPdfInfo(null)
    setPdfProgress('Preparando PDF...')
    setImportText('')
    setError(null)

    const handleSseLine = (line: string) => {
      if (!line.startsWith('data: ')) return
      let event: Record<string, unknown>
      try { event = JSON.parse(line.slice(6)) } catch (err) {
        console.warn('[handlePdfUpload] Failed to parse SSE line:', line.slice(0, 100), err)
        return
      }
      console.log('[handlePdfUpload] SSE event:', event.type, event.type === 'progress' ? event.message : '')
      if (event.type === 'progress') {
        setPdfProgress(event.message as string)
      } else if (event.type === 'result') {
        const text = event.text as string
        console.log('[handlePdfUpload] Result received — textLength:', text?.length, 'totalTransacoes:', event.totalTransacoes)
        console.log('[handlePdfUpload] Text preview:', text?.slice(0, 150))
        setImportText(text)
        setPdfInfo({
          tipo: event.tipo as string,
          titular: event.titular as string,
          periodo: event.periodo as string,
          totalTransacoes: event.totalTransacoes as number,
        })
      } else if (event.type === 'error') {
        throw new Error(event.message as string)
      }
    }

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
        reader.readAsDataURL(file)
      })

      console.log('[handlePdfUpload] Uploading PDF, base64 length:', base64.length)

      const res = await fetch('/api/extract-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64, filename: file.name }),
      })

      console.log('[handlePdfUpload] Response status:', res.status, 'content-type:', res.headers.get('content-type'))

      if (!res.ok) throw new Error(`Erro ao processar PDF (${res.status})`)
      if (!res.body) throw new Error('Sem resposta do servidor')

      const sseReader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await sseReader.read()

        // Process data BEFORE checking done — some runtimes deliver the last
        // chunk with done=true simultaneously, and breaking first would drop it.
        if (value?.length) {
          buffer += decoder.decode(value, { stream: !done })

          // Use \n\n (the real SSE event delimiter) instead of splitting on \n
          let boundary
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const eventBlock = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            for (const line of eventBlock.split('\n')) handleSseLine(line)
          }
        }

        if (done) break
      }

      // Handle any data left in buffer (stream that didn't end with \n\n)
      if (buffer.trim()) {
        console.log('[handlePdfUpload] Remaining buffer after stream close:', buffer.trim().slice(0, 100))
        for (const line of buffer.trim().split('\n')) handleSseLine(line)
      }

    } catch (e: unknown) {
      console.error('[handlePdfUpload] Error:', e)
      setError(e instanceof Error ? e.message : 'Erro ao processar PDF')
    } finally {
      setPdfLoading(false)
      setPdfProgress('')
    }
  }, [])

  const handleImport = useCallback(async () => {
    if (!importText.trim()) return
    setLoading(true)
    setError(null)
    setProgress([])

    try {
      addProgress('Classificando lançamentos', 'pending', rulesCache ? `${ruleCount} regras + IA` : 'Apenas IA')

      const filter = activeSourceObj?.type === 'conta' && (filterFrom || filterTo)
        ? { from: filterFrom, to: filterTo }
        : null

      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: importText, source: activeSource, filter, cachedRules: rulesCache }),
      })

      if (!res.ok) throw new Error('Erro na classificação')
      const data = await res.json()

      addProgress('Classificando lançamentos', 'done', `${data.stats.total} lançamentos (${data.stats.byRules} por regras, ${data.stats.byAI} por IA)`)

      const withSource: Transaction[] = data.transactions.map((tx: Transaction, i: number) => ({
        ...tx, id: `${activeSource}-${Date.now()}-${i}`, source: activeSource, mes: month, isReembolso: tx.isReembolso || tx.valor < 0,
      }))

      const updated = [...transactions, ...withSource]
      setTransactions(updated)
      setImportText('')
      setTab('transactions')

      addProgress('Salvando no Drive', 'pending')
      setSaving(true)
      const saveRes = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: updated, mes: month }),
      })
      const saveData = await saveRes.json()
      setSaveStatus(saveData.saved > 0 ? 'ok' : 'skipped')
      addProgress('Salvando no Drive', 'done', saveData.saved > 0 ? `${saveData.saved} salvos` : 'Já existiam')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      setError(msg)
      setProgress(prev => prev.map(p => p.status === 'pending' ? { ...p, status: 'error' } : p))
    } finally {
      setLoading(false)
      setSaving(false)
    }
  }, [importText, activeSource, activeSourceObj, filterFrom, filterTo, transactions, month, rulesCache, ruleCount, addProgress])

  const handleAddReembolso = () => {
    const v = parseFloat(reimbValor.replace(',', '.'))
    if (!v || v <= 0) return
    const tx: Transaction = {
      id: `reimb-${Date.now()}`, source: `${activeSourceObj?.pessoa}_conta`, descricao: reimbDesc || 'Reembolso empresa',
      valor: -Math.abs(v), data: reimbData || null, categoria: 'viagem_trabalho', natureza: 'pessoal',
      confianca: 'alta', isReembolso: true, mes: month,
    }
    setTransactions(prev => [...prev, tx])
    setReimbValor(''); setReimbDesc('Reembolso empresa'); setReimbData('')
  }

  const handleAddIncome = () => {
    const v = parseFloat(incomeValor.replace(',', '.'))
    if (!v || v <= 0) return
    const t = INCOME_TYPES.find(x => x.id === incomeTipo)
    setIncomes(prev => [...prev, { id: `inc-${Date.now()}`, pessoa: incomePessoa, tipo: incomeTipo, label: t?.label || incomeTipo, valor: v, data: incomeData || null, mes: month }])
    setIncomeValor(''); setIncomeData('')
  }

  const totalCasa = transactions.filter(t => t.natureza === 'casa' && t.valor > 0).reduce((s, t) => s + t.valor, 0)
  const totalPessoal = transactions.filter(t => t.natureza === 'pessoal' && t.valor > 0).reduce((s, t) => s + t.valor, 0)
  const totalReembolsos = Math.abs(transactions.filter(t => t.valor < 0).reduce((s, t) => s + t.valor, 0))
  const totalGastos = totalCasa + totalPessoal
  const totalReceita = incomes.reduce((s, i) => s + i.valor, 0)
  const pplr = incomes.filter(i => i.tipo === 'pplr').reduce((s, i) => s + i.valor, 0)
  const saldo = totalReceita + totalReembolsos - totalGastos
  const rafaelPagou = transactions.filter(t => t.natureza === 'casa' && t.source.startsWith('rafael') && t.valor > 0).reduce((s, t) => s + t.valor, 0)
  const renataPagou = transactions.filter(t => t.natureza === 'casa' && t.source.startsWith('renata') && t.valor > 0).reduce((s, t) => s + t.valor, 0)
  const casaPagou = transactions.filter(t => t.natureza === 'casa' && t.source.startsWith('casa') && t.valor > 0).reduce((s, t) => s + t.valor, 0)
  const RAFAEL_SHARE = 0.59; const RENATA_SHARE = 0.41
  const rafaelAcerto = totalCasa * RAFAEL_SHARE - rafaelPagou - casaPagou * RAFAEL_SHARE
  const renataAcerto = totalCasa * RENATA_SHARE - renataPagou - casaPagou * RENATA_SHARE
  const byCategory = Object.entries(transactions.filter(t => t.valor > 0).reduce((acc, tx) => { acc[tx.categoria] = (acc[tx.categoria] || 0) + tx.valor; return acc }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1])

  const SourceGrid = () => (
    <div className="space-y-2">
      {[{ label: 'Rafael', ids: ['rafael_cartao', 'rafael_conta'] }, { label: 'Renata', ids: ['renata_cartao', 'renata_conta'] }, { label: 'Casa', ids: ['casa_cartao', 'casa_conta'] }].map(({ label, ids }) => (
        <div key={label} className="flex gap-2 items-center">
          <span className="text-xs text-zinc-500 w-12">{label}</span>
          {ids.map(id => {
            const s = SOURCES.find(x => x.id === id)
            const count = transactions.filter(tx => tx.source === id).length
            return (
              <button key={id} onClick={() => setActiveSource(id)} className={`flex-1 py-1.5 text-xs font-medium rounded-xl border transition-all ${activeSource === id ? 'border-zinc-400 bg-zinc-800 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'}`}>
                {s?.type === 'cartao' ? '💳 Cartão' : '🏦 Conta'}{count > 0 ? ` (${count})` : ''}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )

  if (status === 'loading') return <div className="min-h-screen flex items-center justify-center text-zinc-500">Carregando...</div>
  if (!session) return null

  const pessoa = (session.user as { pessoa?: string }).pessoa || 'rafael'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <h1 className="text-2xl font-bold">Finanças</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {loadingRules && <span className="text-xs text-zinc-500 animate-pulse">Carregando regras...</span>}
              {!rulesCache && !loadingRules && (
                <button onClick={loadRules} className="text-xs px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors">⚡ Carregar regras</button>
              )}
              {rulesCache && !loadingRules && (
                <button onClick={loadRules} className="text-xs text-emerald-600 hover:text-emerald-400">✓ {ruleCount} regras ↻</button>
              )}
              {loadingData && <span className="text-xs text-zinc-500 animate-pulse">Carregando...</span>}
              {!loadingData && loadedMonth && (
                <span className="text-xs text-zinc-500">✓ {loadedMonth} · {transactions.length} lançamentos</span>
              )}
              {saving && <span className="text-xs text-zinc-500 animate-pulse">Salvando...</span>}
              {saveStatus === 'ok' && !saving && <span className="text-xs text-emerald-500">✓ Salvo</span>}
              {saveStatus === 'skipped' && !saving && <span className="text-xs text-zinc-500">✓ Já salvo</span>}
              <input value={month} onChange={e => setMonth(e.target.value)} onKeyDown={e => e.key === 'Enter' && navigateMonth()} className="text-sm bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-400 w-24 text-center focus:outline-none" placeholder="MM/AAAA" />
              <button onClick={navigateMonth} title="Carregar mês" className="text-xs px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors">→</button>
              <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-xs text-zinc-600 hover:text-zinc-400">{pessoa === 'rafael' ? 'Rafael' : 'Renata'} ↗</button>
            </div>
          </div>
          <p className="text-sm text-zinc-500">59% Rafael · 41% Renata</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-900 p-1 rounded-xl overflow-x-auto">
          {[{ id: 'import', label: 'Importar' }, { id: 'transactions', label: `Lançamentos (${transactions.length})` }, { id: 'income', label: `Receitas (${incomes.length})` }, { id: 'summary', label: 'Resumo' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap px-2 ${tab === t.id ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-300'}`}>{t.label}</button>
          ))}
        </div>

        {/* Import Tab */}
        {tab === 'import' && (
          <div className="space-y-4">
            <SourceGrid />
            {!loadingData && transactions.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 space-y-1.5">
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Já importados em {month}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {SOURCES.map(s => {
                    const count = transactions.filter(tx => tx.source === s.id).length
                    if (count === 0) return null
                    return (
                      <span key={s.id} className="text-xs text-zinc-400">
                        {s.label}: <span className="text-zinc-200 font-medium">{count}</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            {loadingData && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-500 animate-pulse">
                Carregando lançamentos do mês...
              </div>
            )}
            {isRenata && <div className="bg-rose-950/20 border border-rose-800/30 rounded-xl px-4 py-3 text-sm text-rose-300">🔒 Detalhes privados — só totais aparecem no resumo.</div>}
            <p className="text-sm text-zinc-400">Cole o extrato de <strong className="text-zinc-200">{activeSourceObj?.label}</strong>.</p>
            {activeSourceObj?.type === 'conta' && (
              <div className="bg-amber-950/20 border border-amber-800/30 rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs text-amber-300">📅 Filtrar período</p>
                <div className="flex gap-2">
                  <div className="flex-1"><label className="text-xs text-zinc-500 mb-1 block">De</label><input value={filterFrom} onChange={e => setFilterFrom(e.target.value)} placeholder="DD/MM/AAAA" className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 placeholder-zinc-600 focus:outline-none" /></div>
                  <div className="flex-1"><label className="text-xs text-zinc-500 mb-1 block">Até</label><input value={filterTo} onChange={e => setFilterTo(e.target.value)} placeholder="DD/MM/AAAA" className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 placeholder-zinc-600 focus:outline-none" /></div>
                </div>
              </div>
            )}
            {/* PDF Upload */}
            <div
              className="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl p-5 text-center cursor-pointer transition-all"
              onClick={() => document.getElementById('pdf-input')?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') handlePdfUpload(f) }}
            >
              <input id="pdf-input" type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = '' }} />
              {pdfLoading ? (
                <div className="space-y-2">
                  <div className="text-2xl animate-pulse">📄</div>
                  <p className="text-sm text-zinc-400">{pdfProgress || 'Preparando PDF...'}</p>
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mx-auto w-32">
                    <div className="h-1 bg-zinc-500 rounded-full animate-pulse w-full" />
                  </div>
                </div>
              ) : pdfInfo ? (
                <div className="space-y-1">
                  <div className="text-2xl">✅</div>
                  <p className="text-sm text-zinc-200 font-medium">{pdfInfo.titular}</p>
                  <p className="text-xs text-zinc-500">{pdfInfo.tipo === 'cartao' ? '💳 Fatura cartão' : '🏦 Extrato conta'} · {pdfInfo.periodo} · {pdfInfo.totalTransacoes} transações</p>
                  <p className="text-xs text-zinc-600 mt-1">Clique para trocar o arquivo</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-2xl">📄</div>
                  <p className="text-sm text-zinc-300">Clique ou arraste o PDF aqui</p>
                  <p className="text-xs text-zinc-600">Extrato de conta ou fatura de cartão</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-xs text-zinc-600">ou cole o texto abaixo</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>
            <textarea value={importText} onChange={e => { setImportText(e.target.value); if (pdfInfo) setPdfInfo(null) }} placeholder="Cole aqui o texto do extrato..." className="w-full h-40 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none font-mono" />
            <button onClick={handleImport} disabled={!importText.trim() || loading} className="w-full py-3 rounded-xl bg-zinc-100 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-900 font-semibold text-sm transition-all disabled:cursor-not-allowed">
              {loading ? 'Processando...' : ruleCount > 0 ? `Classificar automaticamente (${ruleCount} regras) →` : 'Classificar automaticamente →'}
            </button>
            <ProgressPanel steps={progress} />
            {error && <div className="bg-red-950/30 border border-red-800/30 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}
          </div>
        )}

        {/* Transactions Tab */}
        {tab === 'transactions' && (
          <div className="space-y-4">
            <SourceGrid />
            {isRenata && <div className="bg-rose-950/20 border border-rose-800/30 rounded-xl px-4 py-3 text-sm text-rose-300">🔒 Modo privado.</div>}
            {(activeSourceObj?.pessoa === 'rafael' || activeSourceObj?.pessoa === 'renata') && (
              <div className="bg-indigo-950/20 border border-indigo-800/30 rounded-2xl p-4 space-y-3">
                <div className="text-sm font-medium text-indigo-300">🧳 Reembolso de viagem</div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={reimbDesc} onChange={e => setReimbDesc(e.target.value)} placeholder="Descrição" className="col-span-2 text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 placeholder-zinc-600 focus:outline-none" />
                  <input value={reimbValor} onChange={e => setReimbValor(e.target.value)} placeholder="Valor (R$)" className="text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 placeholder-zinc-600 focus:outline-none" />
                  <input value={reimbData} onChange={e => setReimbData(e.target.value)} placeholder="Data (DD/MM)" className="text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 placeholder-zinc-600 focus:outline-none" />
                </div>
                <button onClick={handleAddReembolso} disabled={!reimbValor} className="w-full py-2 rounded-xl bg-indigo-900 hover:bg-indigo-800 disabled:bg-zinc-800 disabled:text-zinc-600 text-indigo-200 text-sm font-medium transition-all">Registrar reembolso</button>
              </div>
            )}
            {sourceTxs.length === 0
              ? <div className="text-center py-16 text-zinc-600"><div className="text-4xl mb-3">📄</div><p>Nenhum lançamento.</p><button onClick={() => setTab('import')} className="mt-3 text-sm text-zinc-400 underline">Importar →</button></div>
              : isRenata
                ? <div className="space-y-2">{['casa', 'pessoal'].map(nat => { const txs = sourceTxs.filter(tx => tx.natureza === nat); if (!txs.length) return null; return <div key={nat} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex justify-between items-center"><div><div className="text-sm font-medium text-zinc-300">{nat === 'casa' ? '🏠 Casa' : '👤 Pessoal'}</div><div className="text-xs text-zinc-600 mt-0.5">{txs.length} lançamentos · privado</div></div><div className="text-lg font-bold text-zinc-200">{fmt(txs.reduce((s, t) => s + t.valor, 0))}</div></div> })}</div>
                : <div className="space-y-2">{sourceTxs.map((tx, i) => <TransactionRow key={tx.id || i} tx={tx} index={transactions.indexOf(tx)} onUpdate={(idx, updated) => setTransactions(prev => prev.map((t, j) => j === idx ? updated : t))} onDelete={idx => setTransactions(prev => prev.filter((_, j) => j !== idx))} />)}</div>
            }
          </div>
        )}

        {/* Income Tab */}
        {tab === 'income' && (
          <div className="space-y-4">
            {incomes.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {[['Rafael', incomes.filter(i => i.pessoa === 'rafael').reduce((s, i) => s + i.valor, 0), 'indigo'], ['Renata', incomes.filter(i => i.pessoa === 'renata').reduce((s, i) => s + i.valor, 0), 'rose'], ['Total', incomes.reduce((s, i) => s + i.valor, 0), 'emerald']].map(([label, val, color]) => (
                  <div key={label as string} className={`bg-${color}-950/30 border border-${color}-800/30 rounded-xl p-3`}>
                    <div className={`text-xs text-${color}-400 mb-1`}>{label}</div>
                    <div className={`text-sm font-bold text-${color}-300`}>{fmt(val as number)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="text-sm font-medium text-zinc-300">Registrar receita</div>
              <div className="grid grid-cols-2 gap-2">
                <select value={incomePessoa} onChange={e => setIncomePessoa(e.target.value as 'rafael' | 'renata')} className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300"><option value="rafael">Rafael</option><option value="renata">Renata</option></select>
                <select value={incomeTipo} onChange={e => setIncomeTipo(e.target.value)} className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300">{INCOME_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}</select>
                <input value={incomeValor} onChange={e => setIncomeValor(e.target.value)} placeholder="Valor (R$)" className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 placeholder-zinc-600 focus:outline-none" />
                <input value={incomeData} onChange={e => setIncomeData(e.target.value)} placeholder="Data (DD/MM)" className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 placeholder-zinc-600 focus:outline-none" />
              </div>
              <button onClick={handleAddIncome} disabled={!incomeValor} className="w-full py-2 rounded-xl bg-zinc-100 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-900 text-sm font-semibold transition-all">+ Adicionar receita</button>
            </div>
            {incomes.map((inc, i) => {
              const t = INCOME_TYPES.find(x => x.id === inc.tipo)
              return <div key={inc.id} className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40"><span className="text-lg">{t?.icon || '💰'}</span><div className="flex-1"><div className="text-sm font-medium text-zinc-200">{t?.label}</div><div className="flex gap-2 mt-0.5"><Badge color={inc.pessoa}>{inc.pessoa === 'rafael' ? 'Rafael' : 'Renata'}</Badge>{inc.data && <span className="text-xs text-zinc-500">{inc.data}</span>}</div></div><div className="text-sm font-semibold text-emerald-300">{fmt(inc.valor)}</div><button onClick={() => setIncomes(prev => prev.filter((_, j) => j !== i))} className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded-lg bg-zinc-800 hover:bg-red-900/50 text-zinc-400">✕</button></div>
            })}
          </div>
        )}

        {/* Summary Tab */}
        {tab === 'summary' && transactions.length === 0
          ? <div className="text-center py-16 text-zinc-600"><div className="text-4xl mb-3">📊</div><p>Importe os extratos para ver o resumo.</p></div>
          : tab === 'summary' && (
            <div className="space-y-6">
              {totalReceita > 0 && (
                <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Fluxo do mês</h3>
                  <div className="flex justify-between text-sm"><span className="text-zinc-400">Receita total</span><span className="text-emerald-300 font-medium">{fmt(totalReceita)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-zinc-400">Gastos totais</span><span className="text-red-300 font-medium">− {fmt(totalGastos)}</span></div>
                  {totalReembolsos > 0 && <div className="flex justify-between text-sm"><span className="text-zinc-400">Reembolsos</span><span className="text-emerald-400 font-medium">+ {fmt(totalReembolsos)}</span></div>}
                  <div className="flex justify-between text-sm font-bold border-t border-zinc-700 pt-2"><span className="text-zinc-200">Saldo do mês</span><span className={saldo >= 0 ? 'text-emerald-300' : 'text-red-300'}>{fmt(saldo)}</span></div>
                  {pplr > 0 && <div className="flex justify-between text-xs text-zinc-500 border-t border-zinc-800 pt-2"><span>Saldo sem PPLR</span><span className={saldo - pplr >= 0 ? 'text-emerald-500' : 'text-red-400'}>{fmt(saldo - pplr)}</span></div>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-2xl p-4"><div className="text-xs text-emerald-400 mb-1">Total Casa</div><div className="text-2xl font-bold text-emerald-300">{fmt(totalCasa)}</div></div>
                <div className="bg-sky-950/30 border border-sky-800/30 rounded-2xl p-4"><div className="text-xs text-sky-400 mb-1">Total Pessoal</div><div className="text-2xl font-bold text-sky-300">{fmt(totalPessoal)}</div></div>
              </div>
              <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Divisão da casa</h3>
                {[{ name: 'Rafael', share: 0.59, acerto: rafaelAcerto }, { name: 'Renata', share: 0.41, acerto: renataAcerto }].map(({ name, share, acerto }) => (
                  <div key={name} className="space-y-1">
                    <div className="flex justify-between text-sm"><span className="text-zinc-400">{name} ({Math.round(share * 100)}%)</span><span className="text-zinc-200 font-medium">{fmt(totalCasa * share)}</span></div>
                    <div className="w-full bg-zinc-800 rounded-full h-1.5"><div className="bg-zinc-400 h-1.5 rounded-full" style={{ width: `${share * 100}%` }} /></div>
                  </div>
                ))}
                {(Math.abs(rafaelAcerto) > 0.5 || Math.abs(renataAcerto) > 0.5) && (
                  <div className="pt-3 border-t border-zinc-800 space-y-1">
                    <div className="text-xs text-zinc-500 mb-2">Acerto final</div>
                    {rafaelAcerto > 0.5 && <div className="text-sm text-orange-300">Rafael deve transferir <strong>{fmt(rafaelAcerto)}</strong> para caixa da casa</div>}
                    {renataAcerto > 0.5 && <div className="text-sm text-orange-300">Renata deve transferir <strong>{fmt(renataAcerto)}</strong> para caixa da casa</div>}
                    {rafaelAcerto < -0.5 && <div className="text-sm text-emerald-300">Casa deve reembolsar Rafael <strong>{fmt(Math.abs(rafaelAcerto))}</strong></div>}
                    {renataAcerto < -0.5 && <div className="text-sm text-emerald-300">Casa deve reembolsar Renata <strong>{fmt(Math.abs(renataAcerto))}</strong></div>}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Por categoria</h3>
                {byCategory.map(([catId, total]) => {
                  const cat = getCat(catId)
                  const pct = totalGastos > 0 ? (total / totalGastos) * 100 : 0
                  return <div key={catId} className="flex items-center gap-3"><span className="text-sm w-6">{cat?.icon || '?'}</span><div className="flex-1"><div className="flex justify-between text-xs mb-1"><span className="text-zinc-400">{cat?.label || catId}</span><span className="text-zinc-300 font-medium">{fmt(total)}</span></div><div className="w-full bg-zinc-800 rounded-full h-1"><div className="bg-zinc-500 h-1 rounded-full" style={{ width: `${pct}%` }} /></div></div></div>
                })}
              </div>
            </div>
          )
        }

        <div className="mt-8 text-center text-xs text-zinc-700">Finanças Rafael & Renata</div>
      </div>
    </div>
  )
}
