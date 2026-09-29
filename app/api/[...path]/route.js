import { NextResponse } from 'next/server';
import serverless from 'serverless-http';
import app from '../../../server/src/app.js';
import { connectDB } from '../../../server/src/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handleExpress = serverless(app, { provider: 'aws' });

async function forward(request, context) {
  try {
    await connectDB();
    const { path = [] } = await context.params;
    const query = new URL(request.url).searchParams;
    const queryStringParameters = Object.fromEntries(query.entries());
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
    const requestHeaders = new Headers(request.headers);
    const origin = request.headers.get('origin');
    const requestHost = request.headers.get('host');
    if (origin && (new URL(origin).host === requestHost || origin === new URL(request.url).origin)) {
      requestHeaders.delete('origin');
    }
    const response = await handleExpress({
      httpMethod: request.method,
      path: `/api/${path.map(encodeURIComponent).join('/')}`,
      rawPath: `/api/${path.map(encodeURIComponent).join('/')}`,
      headers: Object.fromEntries(requestHeaders.entries()),
      queryStringParameters,
      body,
      isBase64Encoded: false,
      requestContext: {
        http: { method: request.method, path: request.nextUrl.pathname, protocol: 'HTTP/1.1' },
        identity: { sourceIp: request.headers.get('x-real-ip') || '127.0.0.1' }
      }
    }, {});
    const headers = new Headers(response.headers || {});
    for (const [name, values] of Object.entries(response.multiValueHeaders || {})) {
      headers.delete(name);
      for (const value of values) headers.append(name, value);
    }
    return new NextResponse(response.body || null, {
      status: response.statusCode || 200,
      headers
    });
  } catch (error) {
    console.error('[ZOTRIX] Next API adapter error:', error);
    if (error.name === 'MongooseServerSelectionError' || error.name === 'MongoParseError') {
      return NextResponse.json(
        { message: 'Database connection failed. Check MONGODB_URI and MongoDB network access.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
export const OPTIONS = forward;