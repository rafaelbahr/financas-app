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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pdfBase64, filename } = await req.json()
  if (!pdfBase64) return NextResponse.json({ error: 'pdfBase64 required' }, { status: 400 })

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

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  const cleaned = text.replace(/```json|```/g, '').trim()
  const result = JSON.parse(cleaned)

  // Formatar as transações como texto para o pipeline existente de classify
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

  return NextResponse.json({
    tipo: result.tipo,
    banco: result.banco,
    titular: result.titular,
    periodo: result.periodo,
    text: lines.join('\n'),
    totalTransacoes: lines.length,
  })
}
