/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { type WhatsAppSessionWithGroups } from '~/types/whatsapp';
import { createTRPCRouter, userProcedure } from '../trpc';
import { db } from '~/server/db';

export const userRouter = createTRPCRouter({
  getWhatsAppSession: userProcedure
    .query(async ({ ctx }): Promise<WhatsAppSessionWithGroups | null> => {
      const session = await db.whatsAppSession.findFirst({
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

      return session as WhatsAppSessionWithGroups | null;
    }),
});
