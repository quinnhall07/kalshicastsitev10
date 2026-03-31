import { NextResponse } from 'next/server';

export function middleware(req) {
  // Check if our secure cookie exists
  const authCookie = req.cookies.get('kalshicast-auth');
  const url = req.nextUrl.clone();

  // If the user is trying to access a protected route without the cookie
  if (!authCookie && url.pathname !== '/login') {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If they are logged in but try to go to the login page, send them to the dashboard
  if (authCookie && url.pathname === '/login') {
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Protect the entire site EXCEPT static files, Next.js internals, and the auth API
export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};