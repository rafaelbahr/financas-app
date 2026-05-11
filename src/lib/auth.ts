import { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

const authorizedEmails = (process.env.AUTHORIZED_EMAILS || '').split(',').map(e => e.trim().toLowerCase())

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase() || ''
      return authorizedEmails.includes(email)
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string
        const email = token.email as string
        const rafaelEmail = authorizedEmails[0]
        ;(session.user as { pessoa?: string }).pessoa = email === rafaelEmail ? 'rafael' : 'renata'
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) token.email = user.email
      return token
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
}
