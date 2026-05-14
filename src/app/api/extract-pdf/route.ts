import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXTRACT_PROMPT = `Extraia todas as transações do extrato bancário brasileiro.

Retorne APENAS texto simples neste formato exato (sem markdown, sem explicações):
TIPO:conta
BANCO:nome do banco
TITULAR:nome completo
PERIODO:MM/AAAA
DD/MM/AAAA|DESCRIÇÃO DA TRANSAÇÃO|VALOR

Regras:
- Ignore saldos, rendimentos automáticos (APLIC AUT/APR/MAIS) e totais
- Conta corrente: valor negativo para débito, positivo para crédito
- Fatura cartão: valores sempre positivos
- Uma transação por linha, sem linhas em branco entre elas
- VALOR deve ser número decimal com ponto (ex: -150.00 ou 200.50)`

function parsePlainText(raw: string): {
  tipo: string; banco: string; titular: string; periodo: string; lines: string[]
} {
  const tipo_match = raw.match(/^TIPO:(.+)$/m)
  const banco_match = raw.match(/^BANCO:(.+)$/m)
  const titular_match = raw.match(/^TITULAR:(.+)$/m)
  const periodo_match = raw.match(/^PERIODO:(.+)$/m)

  const tipo = tipo_match?.[1]?.trim() ?? ''
  const banco = banco_match?.[1]?.trim() ?? ''
  const titular = titular_match?.[1]?.trim() ?? ''
  const periodo = periodo_match?.[1]?.trim() ?? ''

  const lines: string[] = []
  for (const raw_line of raw.split('\n')) {
    const line = raw_line.trim()
    if (!line.includes('|')) continue
    const parts = line.split('|')
    if (parts.length < 3) continue
    const data = parts[0].trim()
    const descricao = parts[1].trim()
    const valorStr = parts[2].trim().replace(',', '.')
    const valor = parseFloat(valorStr)
    if (isNaN(valor) || !/^\d{2}\/\d{2}\/\d{4}$/.test(data)) continue
    lines.push(`${data} ${descricao} ${valor}`)
  }

  return { tipo, banco, titular, periodo, lines }
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
        let stopReason: string | null = null

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
          } else if (event.type === 'message_delta') {
            stopReason = event.delta.stop_reason ?? null
          }
        }

        console.log(`[extract-pdf] Stream complete length=${rawText.length} stop_reason=${stopReason}`)
        console.log('[extract-pdf] rawText preview (first 400):', rawText.slice(0, 400))
        console.log('[extract-pdf] rawText tail (last 200):', rawText.slice(-200))

        send({ type: 'progress', message: 'Processando resultado...' })

        const { tipo, banco, titular, periodo, lines } = parsePlainText(rawText)

        console.log(`[extract-pdf] Parsed: tipo=${tipo} banco=${banco} transacoes=${lines.length}`)

        if (lines.length === 0) {
          send({
            type: 'error',
            message: `Nenhuma transação encontrada. Resposta do modelo: ${rawText.slice(0, 300)}`,
          })
          return
        }

        send({
          type: 'result',
          tipo,
          banco,
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
