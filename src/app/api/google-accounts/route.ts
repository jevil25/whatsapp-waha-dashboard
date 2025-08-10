import { NextResponse } from 'next/server';
import { env } from '~/env';

export async function GET() {
  try {
    // Get Google accounts from environment variable
    const googleAccounts = env.GOOGLE_ACCOUNT_EMAILS.split(',').map(email => email.trim());

    return NextResponse.json({
      success: true,
      accounts: googleAccounts
    });
  } catch (error) {
    console.error('Error fetching Google accounts:', error);
    return NextResponse.json(
      { error: 'Error fetching Google accounts' },
      { status: 500 }
    );
  }
}
