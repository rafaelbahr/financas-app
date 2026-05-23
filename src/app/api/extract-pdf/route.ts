import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXTRACT_PROMPT = `Extraia todas as transações do extrato bancário brasileiro.

Retorne APENAS texto simples neste formato exato (sem markdown, sem explicações):
TIPO:conta
TITULAR:nome completo
PERIODO:MM/AAAA
DD/MM/AAAA|DESCRIÇÃO DA TRANSAÇÃO|VALOR

Regras:
- Uma transação por linha após os campos TIPO/TITULAR/PERIODO
- VALOR deve ser número decimal com ponto (ex: -150.00 ou 200.50)
- Valores negativos = débito, positivos = crédito
- Ignore saldos, rendimentos automáticos (APLIC AUT/APR/MAIS) e totais`

function parseResponse(raw: string): { tipo: string; titular: string; periodo: string; lines: string[] } {
  const tipo = raw.match(/^TIPO:(.+)$/im)?.[1]?.trim() ?? 'conta'
  const titular = raw.match(/^TITULAR:(.+)$/im)?.[1]?.trim() ?? ''
  const periodo = raw.match(/^PERIODO:(.+)$/im)?.[1]?.trim() ?? ''

  const lines: string[] = []
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (!line.includes('|')) continue
    const parts = line.split('|')
    if (parts.length < 3) continue
    const date = parts[0].trim()
    const desc = parts[1].trim()
    const valorStr = parts[2].trim().replace(',', '.')
    const valor = parseFloat(valorStr)
    if (isNaN(valor)) continue
    lines.push(`${date} ${desc} ${valor.toFixed(2)}`)
  }

  return { tipo, titular, periodo, lines }
}

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let filename = ''
  let pdfBase64 = ''
  try {
    const body = await req.json()
    pdfBase64 = body.pdfBase64
    filename = body.filename || ''
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!pdfBase64) {
    return new Response(JSON.stringify({ error: 'pdfBase64 required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log(`[extract-pdf] Processing file="${filename}" base64Len=${pdfBase64.length}`)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        send({ type: 'progress', message: 'Analisando PDF com IA...' })

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 6000,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
                },
                {
                  type: 'text',
                  text: EXTRACT_PROMPT + (filename ? `\n\nArquivo: ${filename}` : ''),
                },
              ],
            },
          ],
        })

        let rawText = ''
        let lastProgressLen = 0

        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            rawText += event.delta.text
            if (rawText.length - lastProgressLen > 400) {
              const count = (rawText.match(/^\d{2}\/\d{2}\/\d{4}\|/gm) || []).length
              send({
                type: 'progress',
                message: count > 0 ? `Extraindo transações... ${count} encontradas` : 'Extraindo transações...',
              })
              lastProgressLen = rawText.length
            }
          }
        }

        console.log(`[extract-pdf] Stream complete length=${rawText.length}`)
        console.log('[extract-pdf] rawText preview (first 400):', rawText.slice(0, 400))

        send({ type: 'progress', message: 'Processando resultado...' })

        const { tipo, titular, periodo, lines } = parseResponse(rawText)

        console.log(`[extract-pdf] Parsed: tipo=${tipo} titular=${titular} transacoes=${lines.length}`)

        if (lines.length === 0) {
          console.warn('[extract-pdf] No transactions found. Raw tail:', rawText.slice(-300))
        }

        send({
          type: 'result',
          tipo,
          titular,
          periodo,
          text: lines.join('\n'),
          totalTransacoes: lines.length,
        })
      } catch (e) {
        console.error('[extract-pdf] Error:', e)
        send({ type: 'error', message: String(e) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
