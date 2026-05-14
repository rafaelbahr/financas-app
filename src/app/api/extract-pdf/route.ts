import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const EXTRACT_PROMPT = `Extraia todas as transações do extrato bancário. Ignore saldos, rendimentos automáticos e totais. Conta corrente: valor negativo=débito, positivo=crédito. Fatura cartão: valores positivos.

Retorne APENAS JSON válido sem markdown:
{"tipo":"conta|cartao","banco":"nome","titular":"nome","periodo":"MM/AAAA","transacoes":[{"data":"DD/MM/AAAA","descricao":"texto","valor":0.00}]}`

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

// Closes any unclosed brackets left by a truncated model response
function closeTruncatedJSON(text: string): string {
  const stack: string[] = []
  let inString = false
  let escaped = false

  for (const char of text) {
    if (escaped) { escaped = false; continue }
    if (char === '\\' && inString) { escaped = true; continue }
    if (char === '"') { inString = !inString; continue }
    if (inString) continue
    if (char === '[' || char === '{') stack.push(char === '[' ? ']' : '}')
    else if ((char === ']' || char === '}') && stack.length > 0) stack.pop()
  }

  if (inString) text += '"' // close dangling string
  return text + stack.reverse().join('')
}

function parseModelJSON(raw: string): ReturnType<typeof JSON.parse> {
  // Remove markdown fences
  let text = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  // Extract the outermost JSON object (handles any preamble/postamble text)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1)

  // Remove trailing commas before } or ] (safe: doesn't touch string contents)
  text = text.replace(/,(\s*[}\]])/g, '$1')
  // Fix unescaped control chars inside string values
  text = repairJSONString(text)

  // First attempt: parse as-is
  try {
    return JSON.parse(text)
  } catch {
    // Second attempt: close any unclosed brackets (handles truncated responses)
    const repaired = closeTruncatedJSON(text)
    return JSON.parse(repaired)
  }
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
              const count = (rawText.match(/"data":/g) || []).length
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

        const truncated = stopReason === 'max_tokens'
        console.log(`[extract-pdf] Stream complete length=${rawText.length} stop_reason=${stopReason}`)
        if (truncated) console.warn('[extract-pdf] Response truncated at max_tokens — attempting JSON repair')
        console.log('[extract-pdf] rawText preview (first 500):', rawText.slice(0, 500))
        console.log('[extract-pdf] rawText tail (last 300):', rawText.slice(-300))

        send({ type: 'progress', message: 'Processando resultado...' })

        let result: ReturnType<typeof JSON.parse>
        try {
          result = parseModelJSON(rawText)
        } catch (parseErr) {
          const msg = `Falha ao parsear JSON: ${String(parseErr)} | tail: ${rawText.slice(-200)}`
          console.error('[extract-pdf] JSON parse error:', msg)
          send({ type: 'error', message: msg })
          return
        }

        // Validate shape before using
        if (!result || !Array.isArray(result.transacoes)) {
          const msg = `Resposta inválida: campo transacoes ausente ou não é um array | keys: ${Object.keys(result || {}).join(',')}`
          send({ type: 'error', message: msg })
          return
        }
        if (result.transacoes.length === 0) {
          send({ type: 'error', message: 'Nenhuma transação encontrada no PDF' })
          return
        }

        const lines = (result.transacoes as Array<{
          data: string; descricao: string; valor: number
        }>).map((t) => {
          const valor = t.valor < 0 ? t.valor : Math.abs(t.valor)
          return `${t.data} ${t.descricao} ${valor}`
        })

        console.log(`[extract-pdf] Done tipo=${result.tipo} transacoes=${lines.length}${truncated ? ' (repaired from truncation)' : ''}`)

        send({
          type: 'result',
          tipo: result.tipo,
          banco: result.banco,
          titular: result.titular,
          periodo: result.periodo,
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
