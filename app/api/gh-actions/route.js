import { NextResponse } from 'next/server';

export async function GET() {
  const repo = process.env.NEXT_PUBLIC_GH_REPO || 'quinnhall07/kalshicastdata';
  const token = process.env.GITHUB_TOKEN; // Make sure this is set in .env.local

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
  };

  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=30`, {
      headers,
      next: { revalidate: 60 } // Cache for 60 seconds to prevent spamming
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'GitHub API error', details: errorData }, 
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: 'Internal fetch error', details: err.message }, { status: 500 });
  }
}