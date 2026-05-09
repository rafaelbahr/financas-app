# Finanças Rafael & Renata — Setup Guide

## Pré-requisitos
- Conta Google (já tem)
- Conta Vercel (gratuita em vercel.com)
- Conta Anthropic (console.anthropic.com)

---

## Passo 1 — Google Cloud (OAuth + Service Account)

1. Acesse console.cloud.google.com
2. Crie um projeto novo chamado "financas-app"
3. Ative a **Google Sheets API**:
   - Menu → APIs & Services → Enable APIs
   - Busca: "Google Sheets API" → Enable

### OAuth (para login)
4. Menu → APIs & Services → Credentials
5. Create Credentials → OAuth Client ID
6. Application type: **Web application**
7. Authorized redirect URIs: `https://SEU-APP.vercel.app/api/auth/callback/google`
8. Copie o **Client ID** e **Client Secret**

### Service Account (para ler/escrever nas planilhas)
9. Create Credentials → Service Account
10. Nome: "financas-sheets"
11. Após criar → clique na service account → Keys → Add Key → JSON
12. Baixe o arquivo JSON — você vai precisar de:
    - `client_email` → GOOGLE_SERVICE_ACCOUNT_EMAIL
    - `private_key` → GOOGLE_SERVICE_ACCOUNT_KEY

### Compartilhar planilhas com a Service Account
13. Abra cada planilha do Drive:
    - Finanças Rafael e Renata (lançamentos)
    - Finanças Rafael e Renata — Regras e Patrimônio
    - Finanças Rafael e Renata — Pix Conhecidos
14. Compartilhe com o email da service account (ex: financas-sheets@projeto.iam.gserviceaccount.com)
15. Permissão: **Editor**

---

## Passo 2 — Anthropic API

1. Acesse console.anthropic.com
2. Settings → API Keys → Create Key
3. Copie a chave (começa com `sk-ant-...`)

---

## Passo 3 — Deploy no Vercel

1. Acesse vercel.com → New Project
2. Import Git Repository (ou arraste a pasta do projeto)
3. Em **Environment Variables**, adicione:

```
GOOGLE_CLIENT_ID          = (do OAuth)
GOOGLE_CLIENT_SECRET      = (do OAuth)
GOOGLE_SERVICE_ACCOUNT_EMAIL = (do JSON da service account)
GOOGLE_SERVICE_ACCOUNT_KEY   = (private_key do JSON — cole com as quebras de linha)
NEXTAUTH_URL              = https://SEU-APP.vercel.app
NEXTAUTH_SECRET           = (gere com: openssl rand -base64 32)
ANTHROPIC_API_KEY         = (sk-ant-...)
SHEET_LANCAMENTOS_ID      = 1udglGMeXqF3bsjWAluss7YR8EKaY1I3XmdAumTTC4WU
SHEET_REGRAS_ID           = 1oBpAp5SbwCNmrhEC_24is4eO_Hbwk7rxHHkifHaby3E
SHEET_PIX_ID              = 1mpdZxYIUBiHwL7kzQfJ15cfRTpS1tfVBboOAx7-bMV0
AUTHORIZED_EMAILS         = rafaelbahr@gmail.com,email-da-renata@gmail.com
RAFAEL_SHARE              = 0.59
RENATA_SHARE              = 0.41
```

4. Deploy → aguarda 2-3 minutos

---

## Passo 4 — Voltar ao Google Cloud e adicionar URL de redirect

1. Console Cloud → Credentials → OAuth Client
2. Authorized redirect URIs → adicionar:
   `https://SEU-APP.vercel.app/api/auth/callback/google`
3. Save

---

## Pronto!

- Acesse `https://SEU-APP.vercel.app`
- Faça login com sua conta Google
- Compartilhe o link com a Renata — ela loga com a conta dela

## Uso estimado de API

~R$ 2-5/mês para classificar ~200-300 lançamentos mensais (vocês dois juntos).
