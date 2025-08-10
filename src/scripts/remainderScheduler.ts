import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { PrismaClient, CampaignStatus, ReminderType } from '@prisma/client';
import path from 'path';
import * as dotenv from 'dotenv';

const prisma = new PrismaClient();

// Load environment variables
dotenv.config();

// Get environment variables with fallbacks
const env = {
  GOOGLE_SPREADSHEET_IDS: process.env.GOOGLE_SPREADSHEET_IDS || '',
  GOOGLE_SHEET_NAMES: process.env.GOOGLE_SHEET_NAMES || '',
  GOOGLE_SERVICE_ACCOUNT_FILES: process.env.GOOGLE_SERVICE_ACCOUNT_FILES || '',
  WAHA_API_URL: process.env.WAHA_API_URL || '',
  WAHA_API_KEY: process.env.WAHA_API_KEY || '',
};

// Configure logging
const logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
  warning: (message: string) => console.warn(`[WARNING] ${message}`),
};

interface SheetEntry {
  senderName: string;
  amount: number;
  memberId: string;
  date: string;
  source: string;
  recipientName: string;
  messageId: string;
  createdAt: string;
}

interface SheetConfig {
  spreadsheetId: string;
  sheetName: string;
  serviceAccountFile: string;
}

/**
 * Get Google Sheets service instance for a specific service account
 */
async function getSheetService(serviceAccountFile: string) {
  try {
    const keyFilePath = path.join(process.cwd(), serviceAccountFile);
    
    // Verify if file exists and can be read
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(keyFilePath, 'utf-8');
      const credentials = JSON.parse(content);
      
      // Verify required fields
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Service account file is missing required fields: client_email or private_key');
      }
    } catch (e) {
      logger.error(`Failed to read or parse service account file: ${e}`);
      throw e;
    }

    const auth = new GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client as any });
    return sheets;
  } catch (error) {
    logger.error(`Failed to initialize Google Sheets service: ${error}`);
    throw error;
  }
}

/**
 * Get sheet configurations from environment variables
 */
function getSheetConfigs(): SheetConfig[] {
  if (!env.GOOGLE_SPREADSHEET_IDS || !env.GOOGLE_SHEET_NAMES || !env.GOOGLE_SERVICE_ACCOUNT_FILES) {
    throw new Error('Missing required environment variables: GOOGLE_SPREADSHEET_IDS, GOOGLE_SHEET_NAMES, or GOOGLE_SERVICE_ACCOUNT_FILES');
  }

  const spreadsheetIds = env.GOOGLE_SPREADSHEET_IDS.split(',').map(id => id.trim());
  const sheetNames = env.GOOGLE_SHEET_NAMES.split(',').map(name => name.trim());
  const serviceAccountFiles = env.GOOGLE_SERVICE_ACCOUNT_FILES.split(',').map(file => file.trim());

  // Validate configuration
  if (spreadsheetIds.length === 0) {
    throw new Error('No spreadsheet IDs configured in GOOGLE_SPREADSHEET_IDS');
  }

  if (spreadsheetIds.length !== sheetNames.length || spreadsheetIds.length !== serviceAccountFiles.length) {
    throw new Error('Mismatch in the number of configured spreadsheet IDs, sheet names, and service account files');
  }

  // Filter out any empty values
  const configs: SheetConfig[] = [];
  for (let i = 0; i < spreadsheetIds.length; i++) {
    const spreadsheetId = spreadsheetIds[i];
    const sheetName = sheetNames[i];
    const serviceAccountFile = serviceAccountFiles[i];

    if (!spreadsheetId || !sheetName || !serviceAccountFile) {
      logger.warning(`Skipping invalid configuration at index ${i}: missing required values`);
      continue;
    }

    configs.push({
      spreadsheetId,
      sheetName,
      serviceAccountFile,
    });
  }

  if (configs.length === 0) {
    throw new Error('No valid sheet configurations found');
  }

  return configs;
}

/**
 * Read data from a specific sheet
 */
async function readFromSheet(service: any, config: SheetConfig): Promise<SheetEntry[]> {
  try {
    const result = await service.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: config.sheetName,
    });

    const values = result.data.values;
    if (!values || values.length === 0) {
      logger.warning(`No data found in sheet ${config.sheetName} of spreadsheet ${config.spreadsheetId}`);
      return [];
    }

    // Convert sheet rows to structured data
    // Columns: Sender Name, Amount($), Member ID (Memo), Date, Source, Recipient Name, Message Id, Created At
    const entries: SheetEntry[] = values.slice(1).map((row: string[]) => ({
      senderName: row[0] ?? '',
      amount: row[1] ? parseFloat(row[1]) : 0,
      memberId: row[2] ?? '',
      date: row[3] ?? '',
      source: row[4] ?? '',
      recipientName: row[5] ?? '',
      messageId: row[6] ?? '',
      createdAt: row[7] ?? '',
    }));

    logger.info(`Successfully read ${entries.length} entries from sheet ${config.sheetName}`);
    return entries;
  } catch (error) {
    logger.error(`Failed to read from sheet ${config.sheetName} of spreadsheet ${config.spreadsheetId}: ${error}`);
    throw error;
  }
}

/**
 * Read data from multiple Google Sheets
 */
async function readFromSheets(): Promise<{ [key: string]: SheetEntry[] }> {
  try {
    const configs = getSheetConfigs();
    
    // Read all sheets in parallel
    const results = await Promise.all(
      configs.map(async (config) => {
        const service = await getSheetService(config.serviceAccountFile);
        const entries = await readFromSheet(service, config);
        return {
          key: `${config.spreadsheetId}:${config.sheetName}`,
          entries
        };
      })
    );

    // Convert array of results to an object
    const entriesBySheet = results.reduce((acc, { key, entries }) => {
      acc[key] = entries;
      return acc;
    }, {} as { [key: string]: SheetEntry[] });

    return entriesBySheet;
  } catch (error) {
    logger.error(`Failed to read from Google Sheets: ${error}`);
    throw error;
  }
}

/**
 * Clean recipient name by removing @ and - characters
 */
function cleanRecipientName(recipientName: string): string {
  return recipientName.replace(/[@-]/g, '').trim();
}

/**
 * Check if cleaned recipient name exists in campaign receipt names
 */
function isRecipientInCampaignReceiptNames(cleanedName: string, campaign: any): boolean {
  if (!campaign.recieptNames || !Array.isArray(campaign.recieptNames) || !cleanedName) return false;
  
  // Convert to lowercase for case-insensitive comparison
  const lowerCleanedName = cleanedName.toLowerCase();
  
  // Check if the cleaned name matches any of the receipt names from the campaign
  return campaign.recieptNames.some((receiptName: string) => {
    if (!receiptName) return false;
    
    const receiptNameLower = receiptName.toLowerCase();
    
    // Split both names into parts for partial matching
    const cleanedNameParts = lowerCleanedName.split(' ').filter(part => part.length > 0);
    const receiptNameParts = receiptNameLower.split(' ').filter(part => part.length > 0);
    
    // Check for exact match first
    if (receiptNameLower === lowerCleanedName) {
      return true;
    }
    
    // Check if cleaned name is contained within receipt name or vice versa
    if (receiptNameLower.includes(lowerCleanedName) || lowerCleanedName.includes(receiptNameLower)) {
      return true;
    }
    
    // Check if at least 2 significant parts match between cleaned name and receipt name
    if (cleanedNameParts.length >= 2 && receiptNameParts.length >= 2) {
      const matchingParts = cleanedNameParts.filter(part => 
        part.length > 2 && receiptNameParts.some(receiptPart => 
          receiptPart.length > 2 && (receiptPart.includes(part) || part.includes(receiptPart))
        )
      );
      return matchingParts.length >= 2;
    }
    
    // For single names, check if it's at least 3 characters and matches
    if (cleanedNameParts.length === 1 && cleanedNameParts[0] && cleanedNameParts[0].length > 2) {
      return receiptNameParts.some(receiptPart => 
        receiptPart.length > 2 && cleanedNameParts[0] && (receiptPart.includes(cleanedNameParts[0]) || cleanedNameParts[0].includes(receiptPart))
      );
    }
    
    return false;
  });
}

/**
 * Get completed campaigns that need first reminders sent
 * (campaigns that are completed but don't have any first reminders sent yet)
 */
async function getCampaignsNeedingFirstReminders() {
  const one_minute_ago = new Date(Date.now() - 60 * 1000);
  const now = new Date();
  // Get all completed campaigns
  const completedCampaigns = await prisma.messageCampaign.findMany({
    where: {
      status: CampaignStatus.COMPLETED,
      updatedAt: {
        gte: one_minute_ago,
        lte: now
      }
    },
    select: {
      id: true,
      title: true,
      template: true,
      startDate: true,
      endDate: true,
      status: true,
      updatedAt: true,
      receiptIds: true,
      recieptNames: true,
      members: {
        select: {
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
              memoId: true
            }
          }
        }
      },
      session: {
        select: {
          id: true,
          sessionName: true,
          phoneNumber: true
        }
      },
      group: {
        select: {
          id: true,
          groupName: true,
          groupId: true
        }
      }
    }
  });
  
  return completedCampaigns
}

/**
 * Get unpaid members from a campaign using receipt names for payment matching
 */
async function getUnpaidMembers(campaign: any, sheetEntries: SheetEntry[], startDate: Date, endDate: Date) {
  const unpaidMembers = [];
  
  // First, get all payment entries within date range
  const validPaymentEntries = sheetEntries.filter(entry => {
    const createdAtDate = entry.createdAt
      ? new Date(entry.createdAt + 'Z')
      : new Date(entry.date + 'Z');
    return createdAtDate.getTime() >= startDate.getTime() && createdAtDate.getTime() <= endDate.getTime();
  });
  
  // Filter payment entries to only include those with recipient names matching this campaign's receipt names
  const campaignRelevantEntries = validPaymentEntries.filter(entry => {
    const cleanedRecipientName = cleanRecipientName(entry.recipientName);
    return isRecipientInCampaignReceiptNames(cleanedRecipientName, campaign);
  });
  
  logger.info(`Found ${campaignRelevantEntries.length} payment entries relevant to campaign "${campaign.title || 'Untitled'}" receipt names`);
  
  // For each member, check if their memo ID appears in the relevant payment entries
  for (const campaignMember of campaign.members) {
    const member = campaignMember.member;
    
    // Check if member's memo ID appears in any of the campaign relevant entries
    const memberPaymentEntries = campaignRelevantEntries.filter(entry => 
      entry.memberId === member.memoId
    );
    
    if (memberPaymentEntries.length === 0) {
      // Member has not paid for any of the campaign receipt names
      logger.info(`Member ${member.firstName} ${member.lastName} (${member.memoId}) has not paid for any campaign receipt`);
      unpaidMembers.push(member);
    } else {
      // Member has paid for at least one campaign receipt
      logger.info(`Member ${member.firstName} ${member.lastName} (${member.memoId}) has paid for campaign receipts`);
    }
  }
  
  return {
    unpaidMembers,
    campaignRelevantEntries
  };
}

/**
 * Get unpaid receipt IDs for a specific member
 */
function getUnpaidReceiptIds(member: any, campaign: any, campaignRelevantEntries: SheetEntry[]): string[] {
  if (!campaign.receiptIds || !Array.isArray(campaign.receiptIds)) {
    return [];
  }
  
  // Get all receipt IDs that the member has paid for
  const paidReceiptIds = new Set();
  
  // Find payment entries for this member
  const memberPaymentEntries = campaignRelevantEntries.filter(entry => 
    entry.memberId === member.memoId
  );

  console.log(memberPaymentEntries)
  
  // For each payment entry, find which receipt ID it corresponds to
  memberPaymentEntries.forEach(entry => {
    const cleanedRecipientName = cleanRecipientName(entry.recipientName);

    console.log(cleanedRecipientName)

    // Check which campaign receipt name this payment corresponds to
    if (campaign.receiptNames && Array.isArray(campaign.receiptNames)) {
      campaign.receiptNames.forEach((receiptName: string, index: number) => {
        if (receiptName && isRecipientInCampaignReceiptNames(cleanedRecipientName, { receiptNames: [receiptName] })) {
          // Add the corresponding receipt ID
          if (campaign.receiptIds[index]) {
            paidReceiptIds.add(campaign.receiptIds[index]);
          }
        }
      });
    }
    console.log(paidReceiptIds)
  });
  
  // Return receipt IDs that are NOT in the paid set
  return campaign.receiptIds.filter((receiptId: string) => !paidReceiptIds.has(receiptId));
}

/**
 * Check if a reminder has already been sent for a member in a campaign
 */
async function hasReminderBeenSent(memberId: string, campaignId: string, reminderType: ReminderType): Promise<boolean> {
  const reminder = await prisma.paymentReminder.findUnique({
    where: {
      memberId_campaignId_reminderType: {
        memberId,
        campaignId,
        reminderType
      }
    }
  });
  
  return reminder !== null;
}

/**
 * Record that a reminder has been sent
 */
async function recordReminderSent(memberId: string, campaignId: string, reminderType: ReminderType): Promise<void> {
  try {
    await prisma.paymentReminder.create({
      data: {
        memberId,
        campaignId,
        reminderType,
        sentAt: new Date()
      }
    });
  } catch (error) {
    logger.error(`Failed to record reminder: ${error}`);
  }
}

/**
 * Get members who need follow-up reminders (6 hours after first reminder)
 */
async function getMembersNeedingFollowUpReminders(): Promise<any[]> {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours ago
  
  const firstReminders = await prisma.paymentReminder.findMany({
    where: {
      reminderType: ReminderType.FIRST_REMINDER,
      sentAt: {
        lte: sixHoursAgo
      }
    },
    select: {
      memberId: true,
      campaignId: true,
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          memoId: true
        }
      },
      campaign: {
        select: {
          id: true,
          title: true,
          template: true,
          startDate: true,
          endDate: true,
          receiptIds: true,
          recieptNames: true,
          session: {
            select: {
              id: true,
              sessionName: true,
              phoneNumber: true
            }
          },
          group: {
            select: {
              id: true,
              groupName: true,
              groupId: true
            }
          }
        }
      }
    }
  });
  
  // Filter out members who already received final reminders
  const membersNeedingFollowUp = [];
  for (const reminder of firstReminders) {
    const hasFinalReminder = await hasReminderBeenSent(
      reminder.memberId, 
      reminder.campaignId, 
      ReminderType.FINAL_REMINDER
    );
    
    if (!hasFinalReminder) {
      membersNeedingFollowUp.push({
        member: reminder.member,
        campaign: reminder.campaign
      });
    }
  }
  
  return membersNeedingFollowUp;
}

/**
 * Send reminder message to unpaid members
 */
async function sendReminder(member: any, campaign: any, whatsappSession: any, reminderType: ReminderType = ReminderType.FIRST_REMINDER, unpaidReceiptIds: string[] = []) {
  try {
    // Check if this reminder has already been sent
    const alreadySent = await hasReminderBeenSent(member.id, campaign.id, reminderType);
    if (alreadySent) {
      return;
    }

    // Format the end date and time
    const endDate = campaign.endDate || new Date();
    const endDateFormatted = endDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const endTimeFormatted = endDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Determine grace period based on reminder type
    const gracePeriod = reminderType === ReminderType.FIRST_REMINDER ? '6 hours' : '3 hours';

    // Get receipt IDs - use unpaidReceiptIds if provided, otherwise use all campaign receipt IDs
    const receiptIds = unpaidReceiptIds.length > 0 
      ? unpaidReceiptIds.join(', ') 
      : (campaign.receiptIds && campaign.receiptIds.length > 0 
          ? campaign.receiptIds.join(', ') 
          : 'the campaign');

    // Create the reminder message using the template
    const message = `*Contribution Reminder Template*

Hi ${member.firstName || 'Member'},

We kindly wish to remind you that our records indicate you have not yet contributed to the ongoing campaign for ${receiptIds}.

📅 Campaign closed on: ${endDateFormatted} at ${endTimeFormatted}
🕒 Grace period remaining: ${gracePeriod}

If you have already contributed and are receiving this message in error, please share your proof of payment with the group admins at your earliest convenience.

Please note that, in line with group policy, failure to contribute within this grace period may result in removal from the group.

We appreciate your attention to this matter and your continued support.

Warm regards,
Compliance Team`;

    // Make API call to WAHA
    const response = await fetch(`${env.WAHA_API_URL}/api/sendText`, {
      method: 'POST',
      headers: {
        'X-Api-Key': env.WAHA_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: member.phoneNumber+"@c.us",
        text: message,
        session: whatsappSession.sessionName
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to send reminder: ${response.statusText}`);
    }
    
    // Record that the reminder was sent
    await recordReminderSent(member.id, campaign.id, reminderType);
    
    logger.info(`Sent ${reminderType} reminder to ${member.firstName} (${member.phoneNumber})`);
  } catch (error) {
    logger.error(`Failed to send reminder to ${member.firstName}: ${error}`);
  }
}

// Main function to run the remainder scheduler
async function main() {
  try {
    logger.info('Starting remainder scheduler...');
    
    // Read data from all configured sheets
    const sheetData = await readFromSheets();
    const allEntries = Object.values(sheetData).flat();
    
    // Get completed campaigns that need first reminders
    const completedCampaigns = await getCampaignsNeedingFirstReminders();
    logger.info(`Found ${completedCampaigns.length} campaigns needing first reminders`);
    
    // Process each campaign for first reminders
    for (const campaign of completedCampaigns) {
      // Log available receipt names for this campaign - CRITICAL FOR DEBUGGING
      if (campaign.recieptNames && campaign.recieptNames.length > 0) {
        logger.info(`Campaign "${campaign.title || 'Untitled'}" has receipt names: ${campaign.recieptNames.join(', ')}`);
      } else {
        logger.warning(`Campaign "${campaign.title || 'Untitled'}" has no receipt names configured`);
      }
      
      // Get campaign date range
      const startDate = campaign.startDate;
      const endDate = campaign.endDate || new Date();
      
      // Get unpaid members and relevant payment entries
      const { unpaidMembers, campaignRelevantEntries } = await getUnpaidMembers(campaign, allEntries, startDate, endDate);
      logger.info(`Found ${unpaidMembers.length} unpaid members for campaign ${campaign.title || 'Untitled'}`);
      
      // Send first reminders
      for (const member of unpaidMembers) {
        const unpaidReceiptIds = getUnpaidReceiptIds(member, campaign, campaignRelevantEntries);
        await sendReminder(member, campaign, campaign.session, ReminderType.FIRST_REMINDER, unpaidReceiptIds);
      }
    }
    
    // Check for members needing follow-up reminders (6 hours after first reminder)
    const membersNeedingFollowUp = await getMembersNeedingFollowUpReminders();
    logger.info(`Found ${membersNeedingFollowUp.length} members needing follow-up reminders`);
    
    // Send follow-up reminders
    for (const { member, campaign } of membersNeedingFollowUp) {
      // Re-check if they have paid since the first reminder
      const isPaid = await checkIfMemberHasPaid(member, campaign, allEntries);
      
      if (!isPaid) {
        await sendReminder(member, campaign, campaign.session, ReminderType.FINAL_REMINDER);
      }
    }
    
    logger.info('Remainder scheduler completed successfully');
  } catch (error) {
    logger.error(`Remainder scheduler failed: ${error}`);
  }
}

/**
 * Check if a specific member has paid for a campaign using receipt names for matching
 */
async function checkIfMemberHasPaid(member: any, campaign: any, allEntries: any[]): Promise<boolean> {
  // For follow-up reminders, only check payments made after campaign ended
  const endDate = campaign.endDate || new Date();
  const now = new Date();
  
  // Log available receipt names for debugging - CRITICAL FOR DEBUGGING
  if (campaign.recieptNames && campaign.recieptNames.length > 0) {
    logger.info(`Checking payment for ${member.firstName} against receipt names: ${campaign.recieptNames.join(', ')}`);
  } else {
    logger.warning(`No receipt names configured for campaign - cannot properly check payment for ${member.firstName}`);
    return false;
  }
  
  // Filter payment entries from campaign end date to now (6-hour grace period)
  const validPaymentEntries = allEntries.filter(entry => {
    const createdAtDate = new Date(entry.createdAt || entry.date);
    return createdAtDate >= endDate && createdAtDate <= now;
  });
  
  const campaignRelevantEntries = validPaymentEntries.filter(entry => {
    const cleanedRecipientName = cleanRecipientName(entry.recipientName);
    return isRecipientInCampaignReceiptNames(cleanedRecipientName, campaign);
  });
  
  // Check if member's memo ID appears in any of the campaign relevant entries
  const hasPaid = campaignRelevantEntries.some(entry => entry.memberId === member.memoId);
  
  if (hasPaid) {
    logger.info(`Member ${member.firstName} made payment after campaign ended with memo ID ${member.memoId}`);
  } else {
    logger.info(`Member ${member.firstName} has not made payment since campaign ended`);
  }
  
  return hasPaid;
}

// Run the scheduler immediately once
main();

// Then schedule it to run every minute
setInterval(main, 50 * 1000);

// Handle cleanup when the process is terminated
process.on('SIGINT', async () => {
  logger.info('Shutting down remainder scheduler...');
  await prisma.$disconnect();
  process.exit(0);
});
