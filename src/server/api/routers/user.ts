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
           userId: ctx.session.user.id,
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

      return session;
    }),

  initiateWhatsAppSession: userProcedure
    .mutation(async ({ ctx }) => {
      const timestamp = Date.now().toString();
      const sessionName = `session_${timestamp}`;

      try {
        const response = await fetch(`${WAHA_API_URL}/api/sessions`, {
          method: 'POST',
          headers: WAHA_HEADERS,
          body: JSON.stringify({ name: sessionName }),
        });

        if (!response.ok) {
          console.error('Failed to create WhatsApp session:', response.statusText);
          throw new Error('Failed to create WhatsApp session');
        }

        const startResponse = await fetch(`${WAHA_API_URL}/api/sessions/${sessionName}/start`, {
            method: 'POST',
            headers: WAHA_HEADERS,
        });
    
        if (!startResponse.ok) {
            await fetch(`${WAHA_API_URL}/api/sessions/${sessionName}`, {
                method: 'DELETE',
                headers: WAHA_HEADERS,
            });
          console.error('Failed to start WhatsApp session:', startResponse.statusText);
          throw new Error('Failed to start WhatsApp session');
        }

        const whatsappSession = await db.whatsAppSession.create({
          data: {
            sessionName,
            phoneNumber: '',
            userId: ctx.session.user.id,
          },
        });

        return { sessionName, id: whatsappSession.id };
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

        await db.whatsAppSession.delete({
          where: {
            sessionName: input.sessionName,
            userId: ctx.session.user.id,
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
      limit: z.number().min(1).max(50).default(20),
      cursor: z.number().nullish(),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      const response = await fetch(`${WAHA_API_URL}/api/${input.sessionName}/groups`, {
        method: 'GET',
        headers: WAHA_HEADERS,
      });

      if (!response.ok) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch WhatsApp groups',
        });
      }

      const groups = await response.json() as { id: { _serialized: string }, name: string }[];
      
      // Map and filter groups
      let filteredGroups = groups
        .map(group => ({
          groupId: group.id._serialized,
          groupName: group.name
        }))
        .sort((a, b) => a.groupName.localeCompare(b.groupName));

      // Apply search filter if provided
      if (input.search) {
        const searchLower = input.search.toLowerCase();
        filteredGroups = filteredGroups.filter(
          group => group.groupName.toLowerCase().includes(searchLower)
        );
      }

      // Apply pagination
      const start = input.cursor ?? 0;
      const items = filteredGroups.slice(start, start + input.limit);
      const nextCursor = items.length === input.limit ? start + input.limit : undefined;

      return {
        items,
        nextCursor,
      };
    }),
});
