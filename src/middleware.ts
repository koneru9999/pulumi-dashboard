import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
})

export const config = {
  // Protect everything except auth routes, login page, and Next.js internals
  matcher: ['/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)'],
}
