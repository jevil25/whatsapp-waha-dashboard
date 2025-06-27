import { NextResponse } from 'next/server';
import { env } from '~/env';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = searchParams.get('session');

  if (!session) {
    return new NextResponse('Session parameter is required', { status: 400 });
  }

  try {
    const screenshotUrl = `${env.WAHA_API_URL}/api/screenshot?session=${session}`;
    const response = await fetch(screenshotUrl, {
      headers: {
        'accept': 'image/jpeg',
        'X-Api-Key': env.WAHA_API_KEY,
      }
    });

    if (!response.ok) {
      throw new Error(`Screenshot request failed: ${response.statusText}`);
    }

    const imageBuffer = await response.arrayBuffer();
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') ?? 'image/png',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Screenshot fetch error:', error);
    return new NextResponse('Failed to fetch screenshot', { status: 500 });
  }
}
