import Anthropic from '@anthropic-ai/sdk'
import { ALL_CATS } from './types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SOURCE_CONTEXT: Record<string, string> = {
  rafael_cartao: 'cartão pessoal de Rafael. Uber é pessoal.',
  rafael_conta: 'conta bancária de Rafael. Uber é pessoal.',
  renata_cartao: 'cartão pessoal de Renata. Uber é pessoal.',
  renata_conta: 'conta bancária de Renata. Uber é pessoal.',
  casa_cartao: 'cartão da casa. Uber é do filho (transporte_filho).',
  casa_conta: 'conta da casa. Débitos são predominantemente da casa.',
}

export interface AIClassifiedTx {
  descricao: string
  valor: number
  data: string | null
  categoria: string
  natureza: 'casa' | 'pessoal'
  confianca: 'alta' | 'baixa'
  isReembolso: boolean
}

export async function classifyBatch(lines: string[], source: string): Promise<AIClassifiedTx[]> {
  const catList = ALL_CATS.map(c => `${c.id}: ${c.label}`).join('\n')
  const srcCtx = SOURCE_CONTEXT[source] || 'extrato financeiro'

  const prompt = `Classificador de gastos financeiros pessoais brasileiro. Contexto: ${srcCtx}

Categorias:
${catList}

Regras:
- moradia: aluguel, condomínio, IPTU, financiamento imóvel
- alimentacao_casa: mercado, supermercado, feira, Condor, Festval, Quitanda
- alimentacao_fora: restaurante, delivery, bar, lanchonete, iFood, pizza, burguer, cerveja
- transporte: combustível, pedágio, estacionamento, oficina, pneu, seguro auto
- transporte_filho: Uber no cartão da casa
- uber_pessoal: Uber no cartão pessoal
- contas: luz, água, gás, internet, telefone
- educacao_filhos: escola filhos, van escolar, atividade extracurricular
- educacao: curso adulto, faculdade, idiomas
- assinaturas_casa: Amazon Prime, Netflix família
- assinaturas_pessoais: Disney+, Google One, iFood Club
- saude: farmácia, consulta, exame, nutricionista, personal
- vestuario: roupas, calçados, acessórios
- lazer: cinema, hotel, viagem, hobby, brinquedo
- beleza: salão, barbearia, cosméticos
- viagem_trabalho: viagem corporativa. Reembolso=valor negativo+isReembolso:true
- outros_casa ou outros_pessoal para o resto

Natureza: "casa"=compartilhado, "pessoal"=individual.
Valor negativo no texto: preservar sinal, isReembolso:true.

Lançamentos:
${lines}

Retorne APENAS JSON array sem markdown:
[{"descricao":"...","valor":0.00,"data":"DD/MM","categoria":"id","natureza":"casa","confianca":"alta","isReembolso":false}]`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const cleaned = text.replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned) as AIClassifiedTx[]
}
