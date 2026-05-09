// ---- Types ----
export interface Transaction {
  id: string
  source: string
  descricao: string
  valor: number
  data: string | null
  categoria: string
  natureza: 'casa' | 'pessoal'
  confianca: 'alta' | 'baixa'
  fromPix?: boolean
  fromRule?: boolean
  isReembolso?: boolean
  mes: string
}

export interface Income {
  id: string
  pessoa: 'rafael' | 'renata'
  tipo: string
  label: string
  valor: number
  data: string | null
  mes: string
}

export interface PixRule {
  match: string
  quem: string
  categoria: string
  natureza: string
  pessoa: string
  acao: 'classificar' | 'ignorar' | 'reembolso'
}

export interface CategoryRule {
  match: string
  categoria: string
  natureza: string
  fonte: string
}

export interface RulesCache {
  rules: CategoryRule[]
  pixRules: PixRule[]
  loadedAt: string
}

// ---- Categories ----
export const CATEGORIES = {
  casa: [
    { id: 'moradia', label: 'Moradia', icon: '🏠' },
    { id: 'alimentacao_casa', label: 'Alimentação casa', icon: '🛒' },
    { id: 'contas', label: 'Contas', icon: '💡' },
    { id: 'transporte', label: 'Transporte', icon: '🚗' },
    { id: 'transporte_filho', label: 'Transporte filho', icon: '👦' },
    { id: 'servicos_domesticos', label: 'Serviços domésticos', icon: '🧹' },
    { id: 'assinaturas_casa', label: 'Assinaturas casa', icon: '📺' },
    { id: 'educacao_filhos', label: 'Educação filhos', icon: '🎒' },
    { id: 'pets', label: 'Pets', icon: '🐾' },
    { id: 'outros_casa', label: 'Outros casa', icon: '📦' },
  ],
  pessoal: [
    { id: 'alimentacao_fora', label: 'Alimentação fora', icon: '🍽️' },
    { id: 'uber_pessoal', label: 'Uber pessoal', icon: '🚕' },
    { id: 'saude', label: 'Saúde', icon: '💊' },
    { id: 'vestuario', label: 'Vestuário', icon: '👕' },
    { id: 'lazer', label: 'Lazer', icon: '🎭' },
    { id: 'assinaturas_pessoais', label: 'Assinaturas pessoais', icon: '📱' },
    { id: 'educacao', label: 'Educação', icon: '📚' },
    { id: 'beleza', label: 'Beleza', icon: '✂️' },
    { id: 'viagem_trabalho', label: 'Viagem trabalho', icon: '🧳' },
    { id: 'outros_pessoal', label: 'Outros pessoal', icon: '🔹' },
  ],
  financeiro: [
    { id: 'investimentos', label: 'Investimentos', icon: '📈' },
    { id: 'reserva', label: 'Reserva', icon: '🏦' },
    { id: 'dividas', label: 'Dívidas', icon: '💳' },
  ],
}

export const ALL_CATS = [...CATEGORIES.casa, ...CATEGORIES.pessoal, ...CATEGORIES.financeiro]
export const getCat = (id: string) => ALL_CATS.find((c) => c.id === id)

export const INCOME_TYPES = [
  { id: 'salario', label: 'Salário líquido', icon: '💼' },
  { id: 'adiantamento', label: 'Adiantamento', icon: '📅' },
  { id: 'pplr', label: 'PPLR / Bônus', icon: '🎯' },
  { id: 'reembolso_viagem', label: 'Reembolso viagem', icon: '✈️' },
  { id: 'outros_receita', label: 'Outros', icon: '💰' },
]

export const SOURCES = [
  { id: 'rafael_cartao', label: 'Cartão Rafael', type: 'cartao', pessoa: 'rafael' },
  { id: 'rafael_conta', label: 'Conta Rafael', type: 'conta', pessoa: 'rafael' },
  { id: 'renata_cartao', label: 'Cartão Renata', type: 'cartao', pessoa: 'renata' },
  { id: 'renata_conta', label: 'Conta Renata', type: 'conta', pessoa: 'renata' },
  { id: 'casa_cartao', label: 'Cartão Casa', type: 'cartao', pessoa: 'casa' },
  { id: 'casa_conta', label: 'Conta Casa', type: 'conta', pessoa: 'casa' },
]

export const RAFAEL_SHARE = parseFloat(process.env.RAFAEL_SHARE || '0.59')
export const RENATA_SHARE = parseFloat(process.env.RENATA_SHARE || '0.41')

export const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
