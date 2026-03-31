import { NextResponse } from 'next/server';

export function middleware(req) {
  // 1. Get the Authorization header from the request
  const basicAuth = req.headers.get('authorization');
  
  // 2. Define the exact URL you are protecting (or use the matcher below)
  const validUser = process.env.SITE_ADMIN;
  const validPassword = process.env.SITE_PASSWORD;

  // 3. Check if the user has provided credentials
  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    // Decode the base64 encoded credentials
    const [user, pwd] = atob(authValue).split(':');

    // 4. If credentials match, let them through
    if (user === validUser && pwd === validPassword) {
      return NextResponse.next();
    }
  }

  // 5. If no credentials or wrong credentials, trigger the browser's native login prompt
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="Secure Dashboard"`,
    },
  });
}

// 6. Configure which routes this middleware protects
export const config = {
  // This matcher protects the home page ("/") and all API routes ("/api/...")
  // It ignores static files and Next.js internal files so the login prompt doesn't break
  matcher: ['/', '/api/:path*'],
};