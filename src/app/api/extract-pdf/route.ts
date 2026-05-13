import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXTRACT_PROMPT = `Você é um extrator de transações financeiras de extratos bancários brasileiros.

Analise o PDF e extraia TODAS as transações financeiras. Ignore:
- Linhas de "SALDO DO DIA"
- Rendimentos de aplicação automática (REND PAGO APLIC AUT, APR, MAIS)
- Textos informativos, avisos, rodapés
- Linhas de total/subtotal/resumo

Para EXTRATO DE CONTA CORRENTE (Itaú):
- Formato: "DD/MM/AAAA DESCRIÇÃO VALOR"
- Valor negativo = débito (saída), positivo = crédito (entrada)
- Preservar o sinal original do valor

Para FATURA DE CARTÃO DE CRÉDITO (Itaú):
- Pode ter múltiplos cartões na mesma fatura (ex: "final 4050", "final 0981")
- Inclua TODAS as transações de TODOS os cartões listados na fatura
- Inclua compras parceladas de meses anteriores que aparecem nesta fatura
- Formato: "DD/MM ESTABELECIMENTO VALOR"
- Todos os valores são positivos (débito)
- Para compras parceladas, inclua a parcela que aparece (ex: "01/03" = parcela 1 de 3)

Retorne APENAS um JSON válido, sem markdown, sem texto antes ou depois:
{
  "tipo": "conta" | "cartao",
  "banco": "Itaú" | "XP" | "Rico" | "outro",
  "titular": "nome do titular",
  "periodo": "MM/AAAA ou período identificado",
  "transacoes": [
    {
      "data": "DD/MM/AAAA ou DD/MM",
      "descricao": "descrição original completa",
      "valor": 0.00,
      "cartao_final": "4 dígitos finais do cartão (apenas para fatura cartão com múltiplos cartões, senão null)"
    }
  ]
}`

function repairJSONString(text: string): string {
  // Fix unescaped control characters inside JSON string values by walking char-by-char
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (escaped) {
      result += char
      escaped = false
      continue
    }

    if (char === '\\' && inString) {
      result += char
      escaped = true
      continue
    }

    if (char === '"') {
      inString = !inString
      result += char
      continue
    }

    if (inString) {
      if (char === '\n') { result += '\\n'; continue }
      if (char === '\r') { result += '\\r'; continue }
      if (char === '\t') { result += '\\t'; continue }
    }

    result += char
  }

  return result
}

function parseModelJSON(raw: string): ReturnType<typeof JSON.parse> {
  // Remove markdown fences
  let text = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  // Extract the outermost JSON object (handles any preamble/postamble text)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1)

  // Remove single-line and multi-line comments (outside strings)
  text = text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  // Remove trailing commas before } or ]
  text = text.replace(/,(\s*[}\]])/g, '$1')
  // Fix unescaped control chars inside string values
  text = repairJSONString(text)

  return JSON.parse(text)
}

// Allow up to 60s for large PDFs and Claude processing
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let filename = ''
  let pdfBase64 = ''

  try {
    const body = await req.json()
    pdfBase64 = body.pdfBase64
    filename = body.filename || ''
  } catch (e) {
    console.error('[extract-pdf] Failed to parse request body:', e)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!pdfBase64) return NextResponse.json({ error: 'pdfBase64 required' }, { status: 400 })

  console.log(`[extract-pdf] Processing file="${filename}" base64Len=${pdfBase64.length}`)

  let rawModelText = ''
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              type: 'text',
              text: EXTRACT_PROMPT + (filename ? `\n\nNome do arquivo: ${filename}` : ''),
            },
          ],
        },
      ],
    })

    rawModelText = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    console.log(`[extract-pdf] Model response length=${rawModelText.length} stopReason=${message.stop_reason}`)
  } catch (e) {
    console.error('[extract-pdf] Claude API error:', e)
    return NextResponse.json({ error: 'Claude API error', detail: String(e) }, { status: 502 })
  }

  let result: ReturnType<typeof JSON.parse>
  try {
    result = parseModelJSON(rawModelText)
  } catch (e) {
    console.error('[extract-pdf] JSON parse error:', e)
    console.error('[extract-pdf] Raw model text (first 500):', rawModelText.slice(0, 500))
    return NextResponse.json({ error: 'Failed to parse model response', detail: String(e) }, { status: 500 })
  }

  const lines = (result.transacoes as Array<{
    data: string
    descricao: string
    valor: number
    cartao_final: string | null
  }>).map((t) => {
    const cartaoInfo = t.cartao_final ? ` [cartao:${t.cartao_final}]` : ''
    const valor = t.valor < 0 ? t.valor : Math.abs(t.valor)
    return `${t.data} ${t.descricao}${cartaoInfo} ${valor}`
  })

  console.log(`[extract-pdf] Done tipo=${result.tipo} banco=${result.banco} transacoes=${lines.length}`)

  return NextResponse.json({
    tipo: result.tipo,
    banco: result.banco,
    titular: result.titular,
    periodo: result.periodo,
    text: lines.join('\n'),
    totalTransacoes: lines.length,
  })
}
