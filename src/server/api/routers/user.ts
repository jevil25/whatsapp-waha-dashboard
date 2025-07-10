/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { type SessionStatusResponse, type SessionQRResponse } from '~/types/session';
import { createTRPCRouter, userProcedure } from '../trpc';
import { db } from '~/server/db';

const WAHA_API_URL = process.env.WAHA_API_URL;
const WAHA_API_KEY = process.env.WAHA_API_KEY;

if (!WAHA_API_KEY) {
  throw new Error('WAHA_API_KEY is not set in environment variables');
}

const WAHA_HEADERS = {
  'Content-Type': 'application/json',
  'X-Api-Key': WAHA_API_KEY,
};

export const userRouter = createTRPCRouter({
  getWhatsAppSession: userProcedure
    .query(async ({ ctx }) => {
      const session = await db.whatsAppSession.findUnique({
        where: {
           userId_status: {
            userId: ctx.session.user.id,
            status: 'CONNECTED',
           }
        },
        select: {
          id: true,
          sessionName: true,
          phoneNumber: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
          WhatsAppGroups: {
            select: {
              id: true,
              groupName: true,
              groupId: true,
              sessionId: true,
              createdAt: true,
              updatedAt: true,
              campaigns: {
                where: {
                  isDeleted: false,
                  status: {
                    in: ['SCHEDULED', 'IN_PROGRESS']
                  }
                },
                select: {
                  id: true,
                  status: true,
                  startDate: true,
                }
              }
            }
          }
        },
      });

      const statusResponse = await fetch(`${WAHA_API_URL}/api/sessions/${session?.sessionName}`, {
        headers: WAHA_HEADERS,
      });
      const data = await statusResponse.json();

      if (data.status !== 'WORKING' && data.status !== 'SCAN_QR_CODE') {
        return null;
      }
      return session;
    }),

  initiateWhatsAppSession: userProcedure
    .mutation(async ({ ctx }) => {
      const timestamp = Date.now().toString();
      const sessionName = `session_${timestamp}`;

      try {
        const whatsappSession = await db.whatsAppSession.upsert({
          where: {
            userId: ctx.session.user.id,
          },
          update: {
            status: 'CONNECTED',
          },
          create: {
            sessionName,
            phoneNumber: '',
            userId: ctx.session.user.id,
          },
        });

        const statusResponse = await fetch(`${WAHA_API_URL}/api/sessions/${whatsappSession.sessionName}`, {
          headers: WAHA_HEADERS,
        });
        const data = await statusResponse.json();
        if (data.status == 'WORKING' || data.status == 'SCAN_QR_CODE') {
          const result = await db.whatsAppSession.update({
            where: { id: whatsappSession.id },
            data: { status: 'CONNECTED' },
          });
          return { sessionName: result.sessionName, id: result.id };
        } 

        const response = await fetch(`${WAHA_API_URL}/api/sessions`, {
          method: 'POST',
          headers: WAHA_HEADERS,
          body: JSON.stringify({ name: whatsappSession.sessionName })
        });

        if (!response.ok) {
          console.error('Failed to create WhatsApp session:', response.statusText);
          await db.whatsAppSession.update({
            where: { id: whatsappSession.id },
            data: { status: 'DISCONNECTED' },
          });
          throw new Error('Failed to create WhatsApp session');
        }

        const startResponse = await fetch(`${WAHA_API_URL}/api/sessions/${whatsappSession.sessionName}/start`, {
            method: 'POST',
            headers: WAHA_HEADERS,
        });
    
        if (!startResponse.ok) {
            await fetch(`${WAHA_API_URL}/api/sessions/${whatsappSession.sessionName}`, {
                method: 'DELETE',
                headers: WAHA_HEADERS,
            });
            await db.whatsAppSession.update({
              where: { id: whatsappSession.id },
              data: { status: 'DISCONNECTED' },
            });
          console.error('Failed to start WhatsApp session:', startResponse.statusText);
          throw new Error('Failed to start WhatsApp session');
        }

        return { sessionName: whatsappSession.sessionName, id: whatsappSession.id };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create WhatsApp session',
          cause: error,
        });
      }
    }),

  getSessionStatus: userProcedure
    .input(z.object({ sessionName: z.string() }))
    .query(async ({ input }): Promise<SessionStatusResponse> => {
      try {
        const response = await fetch(`${WAHA_API_URL}/api/sessions/${input.sessionName}`, {
          headers: WAHA_HEADERS,
        });
        if (!response.ok) {
          throw new Error('Failed to get session status');
        }

        const data = await response.json();
        return { status: data.status };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get session status',
          cause: error,
        });
      }
    }),

  getSessionQR: userProcedure
    .input(z.object({ sessionName: z.string() }))
    .query(async ({ input }): Promise<SessionQRResponse> => {
      try {
        const response = await fetch(`${WAHA_API_URL}/api/${input.sessionName}/auth/qr`, {
          headers: WAHA_HEADERS,
        });

        if (!response.ok) {
          throw new Error('Failed to get session QR');
        }

        const imageBuffer = await response.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        
        return { qr: base64Image };
      } catch (error) {
        console.error('Error fetching session QR:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get session QR',
          cause: error,
        });
      }
    }),

  restartSession: userProcedure
    .input(z.object({ sessionName: z.string() }))
    .mutation(async ({ input }) => {
      try {
        // First stop the session
        const stopResponse = await fetch(`${WAHA_API_URL}/api/sessions/${input.sessionName}/stop`, {
          method: 'POST',
          headers: WAHA_HEADERS,
        });

        if (!stopResponse.ok) {
          throw new Error('Failed to stop session');
        }

        // Wait a bit to ensure session is fully stopped
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Then start the session again
        const startResponse = await fetch(`${WAHA_API_URL}/api/sessions/${input.sessionName}/start`, {
          method: 'POST',
          headers: WAHA_HEADERS,
        });

        if (!startResponse.ok) {
          throw new Error('Failed to restart session');
        }

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to restart session',
          cause: error,
        });
      }
    }),

  updateSessionPhone: userProcedure
    .input(z.object({ 
      id: z.string(),
      phoneNumber: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db.whatsAppSession.update({
          where: {
            id: input.id,
            userId: ctx.session.user.id,
          },
          data: {
            phoneNumber: input.phoneNumber,
          },
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update session phone number',
          cause: error,
        });
      }
    }),

  logoutSession: userProcedure
    .input(z.object({ sessionName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const stopResponse = await fetch(`${WAHA_API_URL}/api/sessions/${input.sessionName}/stop`, {
          method: 'POST',
          headers: WAHA_HEADERS,
        });

        if (!stopResponse.ok) {
          throw new Error('Failed to stop session');
        }

        const logoutResponse = await fetch(`${WAHA_API_URL}/api/sessions/${input.sessionName}/logout`, {
          method: 'POST',
          headers: WAHA_HEADERS,
        });

        if (!logoutResponse.ok) {
          throw new Error('Failed to logout from session');
        }

        const deleteResponse = await fetch(`${WAHA_API_URL}/api/sessions/${input.sessionName}`, {
          method: 'DELETE',
          headers: WAHA_HEADERS,
        });

        if (!deleteResponse.ok) {
          throw new Error('Failed to delete session');
        }

        await db.whatsAppSession.updateMany({
          where: {
            sessionName: input.sessionName,
            userId: ctx.session.user.id,
          },
          data: {
            status: "DISCONNECTED"
          },
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to logout from session',
          cause: error,
        });
      }
    }),
  getWhatsAppGroups: userProcedure
    .input(z.object({
      sessionName: z.string(),
      limit: z.number().min(1).default(10),
      cursor: z.number().default(0),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      try {
        // If no search, fetch once and return paginated result
        if (!input.search) {
          const response = await fetch(`${WAHA_API_URL}/api/${input.sessionName}/groups?limit=10&offset=${input.cursor ?? 0}`, {
            method: 'GET',
            headers: {
              ...WAHA_HEADERS,
              'Priority': 'u=1, i',
              'Cache-Control': 'no-cache',
            },
          });

          if (!response.ok) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to fetch WhatsApp groups: ${response.status} ${response.statusText}`,
            });
          }

          const groups = await response.json() as { id: { _serialized: string }, name: string }[];
          const items = groups.map(group => ({
            groupId: group.id._serialized,
            groupName: group.name
          }));

          const nextCursor = items.length === input.limit ? (input.cursor ?? 0) + input.limit : undefined;

          return {
            items,
            nextCursor,
            total: undefined, // Not available without fetching all
          };
        }

        // If search is present, keep fetching in batches of 10 until enough matches or no more data
        const searchLower = input.search.toLowerCase();
        let found: { groupId: string, groupName: string }[] = [];
        let offset = input.cursor ?? 0;
        let done = false;

        while (!done && found.length < input.limit) {
          const response = await fetch(`${WAHA_API_URL}/api/${input.sessionName}/groups?limit=10&offset=${offset}`, {
            method: 'GET',
            headers: {
              ...WAHA_HEADERS,
              'Priority': 'u=1, i',
              'Cache-Control': 'no-cache',
            },
          });

          if (!response.ok) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to fetch WhatsApp groups: ${response.status} ${response.statusText}`,
            });
          }

          const groups = await response.json() as { id: { _serialized: string }, name: string }[];
          if (groups.length === 0) {
            done = true;
            break;
          }

          const filtered = groups
            .map(group => ({
              groupId: group.id._serialized,
              groupName: group.name
            }))
            .filter(group => group.groupName.toLowerCase().includes(searchLower));

          found = found.concat(filtered);
          offset += groups.length;

          // If less than 10 returned, no more data
          if (groups.length < 10) {
            done = true;
          }
        }

        // Only return up to limit
        const items = found.slice(0, input.limit);
        const nextCursor = done || items.length < input.limit ? undefined : offset;

        return {
          items,
          nextCursor,
          total: undefined, // Not available without fetching all
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new TRPCError({
            code: 'TIMEOUT',
            message: 'Request timeout while fetching WhatsApp groups',
          });
        }
        throw error;
      }
    }),

  getWhatsAppContacts: userProcedure
    .input(z.object({
      sessionName: z.string(),
      limit: z.number().min(1).default(50),
      cursor: z.number().default(0),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      try {
        // If no search, fetch once and return paginated result
        if (!input.search) {
          const response = await fetch(`${WAHA_API_URL}/api/contacts/all?session=${input.sessionName}&limit=${input.limit}&offset=${input.cursor ?? 0}`, {
            method: 'GET',
            headers: {
              ...WAHA_HEADERS,
              'Priority': 'u=1, i',
              'Cache-Control': 'no-cache',
            },
          });

          if (!response.ok) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to fetch WhatsApp contacts: ${response.status} ${response.statusText}`,
            });
          }

          const contacts = await response.json() as {
            id: string;
            number: string;
            name: string;
            pushname: string;
            shortName: string;
            isGroup: boolean;
            isMe: boolean;
            isUser: boolean;
            isWAContact: boolean;
            isMyContact: boolean;
            isBlocked: boolean;
          }[];

          // Filter out groups and blocked contacts, and only include actual contacts with IDs ending in c.us
          const filteredContacts = contacts.filter(contact => 
            !contact.isGroup && 
            !contact.isBlocked && 
            !contact.isMe && 
            contact.isWAContact &&
            contact.number &&
            contact.id.endsWith('c.us')
          );

          console.log(filteredContacts)

          const items = filteredContacts.map(contact => ({
            groupId: contact.id, // Using contact ID as groupId for consistency
            groupName: contact.name || contact.pushname || contact.shortName || contact.number,
            number: contact.number,
            isContact: true
          }));

          const nextCursor = items.length === input.limit ? (input.cursor ?? 0) + input.limit : undefined;

          return {
            items,
            nextCursor,
            total: undefined,
          };
        }

        // If search is present, fetch all contacts and filter
        const searchLower = input.search.toLowerCase();
        const response = await fetch(`${WAHA_API_URL}/api/contacts/all?session=${input.sessionName}&offset=${input.cursor ?? 0}`, {
          method: 'GET',
          headers: {
            ...WAHA_HEADERS,
            'Priority': 'u=1, i',
            'Cache-Control': 'no-cache',
          },
        });

        if (!response.ok) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch WhatsApp contacts: ${response.status} ${response.statusText}`,
          });
        }

        const contacts = await response.json() as {
          id: string;
          number: string;
          name: string;
          pushname: string;
          shortName: string;
          isGroup: boolean;
          isMe: boolean;
          isUser: boolean;
          isWAContact: boolean;
          isMyContact: boolean;
          isBlocked: boolean;
        }[];

        console.log(contacts)

        // Filter out groups, blocked contacts, and search - only include contacts with IDs ending in c.us
        const filteredContacts = contacts.filter(contact => 
          !contact.isGroup && 
          !contact.isBlocked && 
          !contact.isMe && 
          contact.isWAContact &&
          contact.number &&
          contact.id.endsWith('c.us') &&
          (contact.name?.toLowerCase().includes(searchLower) ||
           contact.pushname?.toLowerCase().includes(searchLower) ||
           contact.shortName?.toLowerCase().includes(searchLower) ||
           contact.number?.includes(input.search ?? ''))
        );

        const items = filteredContacts.slice(0, input.limit).map(contact => ({
          groupId: contact.id,
          groupName: contact.name || contact.pushname || contact.shortName || contact.number,
          number: contact.number,
          isContact: true
        }));

        const nextCursor = filteredContacts.length > input.limit ? (input.cursor ?? 0) + input.limit : undefined;

        return {
          items,
          nextCursor,
          total: undefined,
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new TRPCError({
            code: 'TIMEOUT',
            message: 'Request timeout while fetching WhatsApp contacts',
          });
        }
        throw error;
      }
    }),
});
