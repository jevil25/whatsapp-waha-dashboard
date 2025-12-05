import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Member management disabled - Google Sheets feature not needed
export const sheetsRouter = createTRPCRouter({
  validateSheet: protectedProcedure
    .input(z.object({
      sheetInput: z.string(),
      selectedAccount: z.string().optional(),
    }))
    .mutation(async () => {
      throw new Error('Member management feature is disabled');
    }),
});

/* Original implementation - Member management disabled
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { google } from 'googleapis';
import { env } from "~/env";

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

export const sheetsRouter = createTRPCRouter({
  validateSheet: protectedProcedure
    .input(
      z.object({
        sheetUrl: z.string(),
        sheetEmail: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { sheetUrl, sheetEmail } = input;
      const sheetId = extractSheetId(sheetUrl);

      if (!sheetId) {
        throw new Error('Invalid Google Sheet URL or ID');
      }

      const hasAccess = await validateSheetAccess(sheetId, sheetEmail);
      
      if (!hasAccess) {
        throw new Error('The selected Google account does not have access to this sheet');
      }

      return { sheetId };
    }),
});
*/
