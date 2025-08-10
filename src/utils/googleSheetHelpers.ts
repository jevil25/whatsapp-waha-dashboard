import { google } from 'googleapis';
import { env } from '~/env';

export function extractSheetId(input: string): string | undefined {
  // Handle full URLs
  if (input.includes('spreadsheets/d/')) {
    const match = input.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) return match[1];
  }
  
  // If it's not a URL, assume it's already an ID
  return input.trim();
}

export async function validateSheetAccess(sheetId: string, email: string): Promise<boolean> {
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
