import { NextRequest } from 'next/server';

const API_URL = process.env['API_URL'] || 'http://localhost:3000';

/**
 * Catch-all API proxy route. Replaces Next.js rewrites to give us
 * control over timeouts. The default rewrite proxy times out at ~30s
 * which is too short for search + classification pipelines.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await params);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await params);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await params);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await params);
}

async function proxy(req: NextRequest, params: { path: string[] }) {
  const path = params.path.join('/');
  const url = new URL(`/${path}`, API_URL);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    // Skip host and next-specific headers
    if (key !== 'host' && !key.startsWith('x-next-') && key !== 'connection') {
      headers[key] = value;
    }
  });

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.text()
    : undefined;

  try {
    const response = await fetch(url.toString(), {
      method: req.method,
      headers,
      body,
      // No timeout — let the browser handle it (default ~5 min)
    });

    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proxy error';
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
