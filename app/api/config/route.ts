import { NextResponse } from 'next/server';

/**
 * Reports feature availability to the client. Only ever exposes a boolean --
 * the key itself never leaves the server.
 */
export async function GET() {
  return NextResponse.json({ imagesEnabled: Boolean(process.env.PEXELS_API_KEY) });
}