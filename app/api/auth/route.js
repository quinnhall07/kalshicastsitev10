import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    
    // Read credentials from your .env.local
    const adminUser1 = process.env.SITE_ADMIN_1;
    const adminUser2 = process.env.SITE_ADMIN_2;
    const validPassword = process.env.SITE_PASSWORD;

    // Verify both username and password
    if ((username === adminUser1 && password === validPassword)||(username === adminUser2 && password === validPassword)) {
      const response = NextResponse.json({ success: true });
      
      // We set the cookie value to 'admin'. 
      // Later, you can set this to 'viewer' for other users to limit what they see.
      response.cookies.set({
        name: 'kalshicast-auth',
        value: username,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 21600, // 24 hours
        path: '/',
      });

      return response;
    }

    // Generic error message so attackers don't know if they got the username or password wrong
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}