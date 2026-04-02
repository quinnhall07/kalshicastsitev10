import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  // Clear the authentication cookie by deleting it
  response.cookies.delete('kalshicast-auth');
  return response;
}