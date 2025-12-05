import { NextRequest, NextResponse } from 'next/server';

// Member management disabled - Google Sheets validation not needed
export async function POST(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: 'Member management feature is disabled'
  }, { status: 400 });
}

/* Original implementation - Member management disabled
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { env } from '~/env';

function extractSheetId(input: string): string {
  // Handle full URLs
  if (input.includes('spreadsheets/d/')) {
    const match = input.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) return match[1];
  }
  
  // If it's not a URL, assume it's already an ID
  return input.trim();
}

async function validateSheetAccess(sheetId: string, email: string): Promise<boolean> {
  try {
    // Find the corresponding client ID, secret, and refresh token for the email
    const emails = env.GOOGLE_ACCOUNT_EMAILS.split(',');
    const index = emails.indexOf(email);
    
    if (index === -1) {
      throw new Error('Email not found in configured accounts');
    }

    const clientIds = env.GOOGLE_CLIENT_IDS.split(',');
    const clientSecrets = env.GOOGLE_CLIENT_SECRETS.split(',');
    const refreshTokens = env.GOOGLE_REFRESH_TOKENS.split(',');

    const oauth2Client = new google.auth.OAuth2(
      clientIds[index],
      clientSecrets[index],
    );

    oauth2Client.setCredentials({
      refresh_token: refreshTokens[index]
    });

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // Try to access the spreadsheet metadata
    await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
    });

    return true;
  } catch (error) {
    console.error('Error validating sheet access:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sheetInput, selectedAccount } = await req.json();

    if (!sheetInput) {
      return NextResponse.json({ error: 'No sheet ID or URL provided' }, { status: 400 });
    }

    if (!selectedAccount) {
      return NextResponse.json({ error: 'No Google account selected' }, { status: 400 });
    }

    const sheetId = extractSheetId(sheetInput);
    const hasAccess = await validateSheetAccess(sheetId, selectedAccount);

    if (!hasAccess) {
      return NextResponse.json({ 
        error: 'The selected Google account does not have access to this sheet' 
      }, { status: 403 });
    }

    return NextResponse.json({ 
      success: true,
      sheetId 
    });

  } catch (error) {
    console.error('Error validating sheet access:', error);
    return NextResponse.json(
      { error: 'Error validating sheet access' }, 
      { status: 500 }
    );
  }
}
*/
