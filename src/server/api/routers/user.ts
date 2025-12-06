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
  getClubMembers: userProcedure
    .query(async ({ ctx }) => {
      // Only allow non-guest users to access club members
      if (ctx.session?.user.role === 'GUEST') {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Only registered users can access club members',
        });
      }

      const members = await ctx.db.clubMember.findMany({
        orderBy: [
          { firstName: 'asc' },
          { lastName: 'asc' }
        ]
      });

      return members;
    }),
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
          const restartResponse = await fetch(`${WAHA_API_URL}/api/sessions/${whatsappSession.sessionName}/restart`, {
            method: 'POST',
            headers: WAHA_HEADERS,
          });
          if (!restartResponse.ok) {
            console.error('Failed to restart WhatsApp session:', restartResponse.statusText);
          }
          await db.whatsAppSession.update({
            where: { id: whatsappSession.id },
            data: { status: 'CONNECTED' },
          });
          // throw new Error('Failed to create WhatsApp session');
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
          const response = await fetch(`${WAHA_API_URL}/api/${input.sessionName}/groups?exclude=participants`, {
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

          const groups = await response.json() as { JID: string, Name: string }[];
          const items = groups.map(group => ({
            groupId: group.JID,
            groupName: group.Name
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

          const groups = await response.json() as { JID: string, Name: string }[];
          if (groups.length === 0) {
            done = true;
            break;
          }

          const filtered = groups
            .map(group => ({
              groupId: group.JID,
              groupName: group.Name
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
            name: string;
            pushname: string;
          }[];

          // Filter to only include actual contacts with IDs ending in c.us or lid
          const filteredContacts = contacts.filter(contact => 
            contact.id.endsWith('c.us') || contact.id.endsWith('lid')
          );

          console.log(filteredContacts)

          const items = filteredContacts.map(contact => ({
            groupId: contact.id, // Using contact ID as groupId for consistency
            groupName: contact.name || contact.pushname || contact.id,
            number: contact.id.split('@')[0], // Extract number from ID
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
          name: string;
          pushname: string;
        }[];

        console.log(contacts)

        // Filter contacts with IDs ending in c.us or lid and apply search
        const filteredContacts = contacts.filter(contact => 
          (contact.id.endsWith('c.us') || contact.id.endsWith('lid')) &&
          (contact.name?.toLowerCase().includes(searchLower) ||
           contact.pushname?.toLowerCase().includes(searchLower) ||
           contact.id.includes(input.search ?? ''))
        );

        const items = filteredContacts.slice(0, input.limit).map(contact => ({
          groupId: contact.id,
          groupName: contact.name || contact.pushname || contact.id,
          number: contact.id.split('@')[0], // Extract number from ID
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

  getWhatsAppChannels: userProcedure
    .input(z.object({
      sessionName: z.string(),
      role: z.enum(['OWNER', 'ADMIN', 'SUBSCRIBER']).optional(),
    }))
    .query(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      try {
        // Build the URL with optional role filter
        let url = `${WAHA_API_URL}/api/${input.sessionName}/channels`;
        if (input.role) {
          url += `?role=${input.role}`;
        }

        const response = await fetch(url, {
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
            message: `Failed to fetch WhatsApp channels: ${response.status} ${response.statusText}`,
          });
        }

        const channels = await response.json() as {
          id: string;
          name: string;
          description?: string;
          invite?: string;
          picture?: string;
          verified: boolean;
          role: 'OWNER' | 'ADMIN' | 'SUBSCRIBER';
        }[];

        return channels.map(channel => ({
          id: channel.id,
          name: channel.name,
          description: channel.description,
          invite: channel.invite,
          picture: channel.picture,
          verified: channel.verified,
          role: channel.role
        }));
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new TRPCError({
            code: 'TIMEOUT',
            message: 'Request timeout while fetching WhatsApp channels',
          });
        }
        throw error;
      }
    }),

  getChannelDetails: userProcedure
    .input(z.object({
      sessionName: z.string(),
      channelId: z.string(),
    }))
    .query(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      try {
        // Escape @ to %40 in channelId
        const escapedChannelId = input.channelId.replace(/@/g, '%40');
        const response = await fetch(`${WAHA_API_URL}/api/${input.sessionName}/channels/${escapedChannelId}`, {
          method: 'GET',
          headers: WAHA_HEADERS,
        });

        if (!response.ok) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch channel details: ${response.status} ${response.statusText}`,
          });
        }

        const channel = await response.json() as {
          id: string;
          name: string;
          description?: string;
          invite?: string;
          picture?: string;
          verified: boolean;
          role: 'OWNER' | 'ADMIN' | 'SUBSCRIBER';
          followers?: number;
        };

        return channel;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch channel details',
          cause: error,
        });
      }
    }),

  createChannel: userProcedure
    .input(z.object({
      sessionName: z.string(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      picture: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      try {
        const url = `${WAHA_API_URL}/api/${input.sessionName}/channels`;
        console.log('Creating channel:', url, input);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: WAHA_HEADERS,
          body: JSON.stringify({
            name: input.name,
            description: input.description,
            picture: input.picture,
          }),
        });

        console.log('Create channel response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Create channel error:', errorText);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to create channel: ${response.status} ${response.statusText} - ${errorText}`,
          });
        }

        const channel = await response.json() as {
          id: string;
          name: string;
          description?: string;
          picture?: string;
        };

        console.log('Channel created successfully:', channel.id);
        return channel;
      } catch (error) {
        console.error('Create channel exception:', error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create channel: ${error instanceof Error ? error.message : 'Unknown error'}`,
          cause: error,
        });
      }
    }),

  // NOTE: Delete channel is currently not implemented in WhatsApp/WAHA server
  // Keeping the endpoint commented out for future use when the feature becomes available
  // deleteChannel: userProcedure
  //   .input(z.object({
  //     sessionName: z.string(),
  //     channelId: z.string(),
  //   }))
  //   .mutation(async ({ input }) => {
  //     if (!WAHA_API_URL) {
  //       throw new TRPCError({
  //         code: 'INTERNAL_SERVER_ERROR',
  //         message: 'WhatsApp API URL is not configured',
  //       });
  //     }

  //     try {
  //       // Escape @ to %40 in channelId
  //       const escapedChannelId = input.channelId.replace(/@/g, '%40');
  //       const url = `${WAHA_API_URL}/api/${input.sessionName}/channels/${escapedChannelId}`;
  //       console.log('Deleting channel:', url);
  //       
  //       const response = await fetch(url, {
  //         method: 'DELETE',
  //         headers: WAHA_HEADERS,
  //       });

  //       console.log('Delete channel response status:', response.status);

  //       if (!response.ok) {
  //         const errorText = await response.text();
  //         console.error('Delete channel error:', errorText);
  //         throw new TRPCError({
  //           code: 'INTERNAL_SERVER_ERROR',
  //           message: `Failed to delete channel: ${response.status} ${response.statusText} - ${errorText}`,
  //         });
  //       }

  //       const data = await response.json() as { success?: boolean };
  //       return { success: true, data };
  //     } catch (error) {
  //       console.error('Delete channel exception:', error);
  //       if (error instanceof TRPCError) {
  //         throw error;
  //       }
  //       throw new TRPCError({
  //         code: 'INTERNAL_SERVER_ERROR',
  //         message: `Failed to delete channel: ${error instanceof Error ? error.message : 'Unknown error'}`,
  //         cause: error,
  //       });
  //     }
  //   }),

  manageChannelAdmins: userProcedure
    .input(z.object({
      sessionName: z.string(),
      channelId: z.string(),
      action: z.enum(['promote', 'demote']),
      phoneNumbers: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      try {
        // Escape @ to %40 in channelId
        const escapedChannelId = input.channelId.replace(/@/g, '%40');
        const url = `${WAHA_API_URL}/api/${input.sessionName}/channels/${escapedChannelId}/admins`;
        console.log('Managing channel admins:', url, input);
        
        const response = await fetch(url, {
          method: 'PUT',
          headers: WAHA_HEADERS,
          body: JSON.stringify({
            action: input.action,
            participants: input.phoneNumbers,
          }),
        });

        console.log('Manage admins response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Manage admins error:', errorText);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to manage channel admins: ${response.status} ${response.statusText} - ${errorText}`,
          });
        }

        return { success: true };
      } catch (error) {
        console.error('Manage admins exception:', error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to manage channel admins: ${error instanceof Error ? error.message : 'Unknown error'}`,
          cause: error,
        });
      }
    }),

  generateChannelInvite: userProcedure
    .input(z.object({
      sessionName: z.string(),
      channelId: z.string(),
    }))
    .mutation(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      try {
        // Escape @ to %40 in channelId
        const escapedChannelId = input.channelId.replace(/@/g, '%40');
        const url = `${WAHA_API_URL}/api/${input.sessionName}/channels/${escapedChannelId}`;
        console.log('Fetching channel details for invite:', url);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: WAHA_HEADERS,
        });

        console.log('Channel details response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Channel details error:', errorText);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to get channel invite: ${response.status} ${response.statusText} - ${errorText}`,
          });
        }

        const channel = await response.json() as { invite?: string };
        
        if (!channel.invite) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Channel invite link not available',
          });
        }
        
        return { inviteLink: channel.invite };
      } catch (error) {
        console.error('Generate invite exception:', error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get channel invite: ${error instanceof Error ? error.message : 'Unknown error'}`,
          cause: error,
        });
      }
    }),

  revokeChannelInvite: userProcedure
    .input(z.object({
      sessionName: z.string(),
      channelId: z.string(),
    }))
    .mutation(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      try {
        // Escape @ to %40 in channelId
        const escapedChannelId = input.channelId.replace(/@/g, '%40');
        const url = `${WAHA_API_URL}/api/${input.sessionName}/channels/${escapedChannelId}/invite`;
        console.log('Revoking channel invite:', url);
        
        const response = await fetch(url, {
          method: 'DELETE',
          headers: WAHA_HEADERS,
        });

        console.log('Revoke invite response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Revoke invite error:', errorText);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to revoke invite link: ${response.status} ${response.statusText} - ${errorText}`,
          });
        }

        return { success: true };
      } catch (error) {
        console.error('Revoke invite exception:', error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to revoke invite link: ${error instanceof Error ? error.message : 'Unknown error'}`,
          cause: error,
        });
      }
    }),

  followChannel: userProcedure
    .input(z.object({
      sessionName: z.string(),
      channelId: z.string(),
      action: z.enum(['follow', 'unfollow']),
    }))
    .mutation(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      try {
        // Escape @ to %40 in channelId
        const escapedChannelId = input.channelId.replace(/@/g, '%40');
        const response = await fetch(`${WAHA_API_URL}/api/${input.sessionName}/channels/${escapedChannelId}/follow`, {
          method: 'PUT',
          headers: WAHA_HEADERS,
          body: JSON.stringify({
            action: input.action,
          }),
        });

        if (!response.ok) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to ${input.action} channel: ${response.status} ${response.statusText}`,
          });
        }

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to ${input.action} channel`,
          cause: error,
        });
      }
    }),

  muteChannel: userProcedure
    .input(z.object({
      sessionName: z.string(),
      channelId: z.string(),
      mute: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      try {
        // Escape @ to %40 in channelId
        const escapedChannelId = input.channelId.replace(/@/g, '%40');
        const response = await fetch(`${WAHA_API_URL}/api/${input.sessionName}/channels/${escapedChannelId}/mute`, {
          method: 'PUT',
          headers: WAHA_HEADERS,
          body: JSON.stringify({
            mute: input.mute,
          }),
        });

        if (!response.ok) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to ${input.mute ? 'mute' : 'unmute'} channel: ${response.status} ${response.statusText}`,
          });
        }

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to ${input.mute ? 'mute' : 'unmute'} channel`,
          cause: error,
        });
      }
    }),

  sendMessage: userProcedure
    .input(z.object({
      sessionName: z.string(),
      chatId: z.string(),
      text: z.string(),
    }))
    .mutation(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      try {
        console.log('Sending WhatsApp message:', {
          chatId: input.chatId,
          session: input.sessionName,
          textLength: input.text.length
        });
        
        const response = await fetch(`${WAHA_API_URL}/api/sendText`, {
          method: 'POST',
          headers: WAHA_HEADERS,
          body: JSON.stringify({
            chatId: input.chatId,
            text: input.text,
            linkPreview: true,
            linkPreviewHighQuality: false,
            session: input.sessionName,
          }),
        });

        console.log('Send message response status:', response.status);

        if (response.status !== 201) {
          const errorText = await response.text();
          console.error('Send message error:', errorText);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to send message: ${response.status} ${response.statusText} - ${errorText}`,
          });
        }

        const messageData = await response.json() as { id?: string };
        
        // Store sent message in database
        try {
          await db.receivedMessage.create({
            data: {
              messageId: messageData.id ?? `frontend_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              sessionName: input.sessionName,
              event: 'message',
              timestamp: new Date(),
              from: input.chatId,
              fromMe: true,
              to: input.chatId,
              body: input.text,
              hasMedia: false,
              source: 'frontend',
              chatId: input.chatId,
              payload: { text: input.text, chatId: input.chatId },
            },
          });
        } catch (dbError) {
          console.error('Failed to store message in database:', dbError);
          // Don't throw error, message was sent successfully
        }

        console.log('Message sent successfully');
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
          cause: error,
        });
      }
    }),

  sendImage: userProcedure
    .input(z.object({
      sessionName: z.string(),
      chatId: z.string(),
      imageUrl: z.string(),
      caption: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!WAHA_API_URL) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'WhatsApp API URL is not configured',
        });
      }

      try {
        console.log('Sending WhatsApp image:', {
          chatId: input.chatId,
          session: input.sessionName,
          imageUrl: input.imageUrl,
        });
        
        const response = await fetch(`${WAHA_API_URL}/api/sendImage`, {
          method: 'POST',
          headers: WAHA_HEADERS,
          body: JSON.stringify({
            chatId: input.chatId,
            file: {
              url: input.imageUrl,
              mimetype: "image/jpeg",
              filename: "image.jpg"
            },
            caption: input.caption ?? '',
            session: input.sessionName,
          }),
        });

        console.log('Send image response status:', response.status);

        if (response.status !== 201) {
          const errorText = await response.text();
          console.error('Send image error:', errorText);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to send image: ${response.status} ${response.statusText} - ${errorText}`,
          });
        }

        const messageData = await response.json() as { id?: string };
        
        // Store sent image in database
        try {
          await db.receivedMessage.create({
            data: {
              messageId: messageData.id ?? `frontend_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              sessionName: input.sessionName,
              event: 'message',
              timestamp: new Date(),
              from: input.chatId,
              fromMe: true,
              to: input.chatId,
              body: input.caption ?? null,
              hasMedia: true,
              mediaUrl: input.imageUrl,
              source: 'frontend',
              chatId: input.chatId,
              payload: { imageUrl: input.imageUrl, caption: input.caption, chatId: input.chatId },
            },
          });
        } catch (dbError) {
          console.error('Failed to store image message in database:', dbError);
          // Don't throw error, message was sent successfully
        }

        console.log('Image sent successfully');
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to send image: ${error instanceof Error ? error.message : 'Unknown error'}`,
          cause: error,
        });
      }
    }),

  getChannelMessages: userProcedure
    .input(z.object({
      sessionName: z.string(),
      channelId: z.string(),
      limit: z.number().optional().default(50),
    }))
    .query(async ({ input }) => {
      try {
        const messages = await db.receivedMessage.findMany({
          where: {
            sessionName: input.sessionName,
            chatId: input.channelId,
          },
          orderBy: {
            timestamp: 'desc',
          },
          take: input.limit * 2, // Fetch extra in case of duplicates
        });

        // Deduplicate by messageId (in case same message was received from multiple events)
        const uniqueMessages = new Map();
        for (const msg of messages) {
          if (!uniqueMessages.has(msg.messageId)) {
            uniqueMessages.set(msg.messageId, msg);
          }
        }

        // Convert back to array, sort by timestamp (ascending - oldest first), and limit
        const deduplicated = Array.from(uniqueMessages.values())
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
          .slice(0, input.limit);

        return deduplicated;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch channel messages',
          cause: error,
        });
      }
    }),
});

