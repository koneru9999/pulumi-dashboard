import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

const ALLOWED_DOMAIN = process.env.AUTH_ALLOWED_DOMAIN
if (!ALLOWED_DOMAIN) {
  throw new Error('AUTH_ALLOWED_DOMAIN env var is required')
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      if (!profile?.email) {
        return false
      }
      return profile.email.endsWith(`@${ALLOWED_DOMAIN}`)
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
})
