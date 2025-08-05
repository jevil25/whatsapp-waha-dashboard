import { z } from 'zod';
import { createTRPCRouter, adminProcedure } from '../trpc';
import { db } from '~/server/db';
import { TRPCError } from '@trpc/server';
import { auth } from '~/server/auth';

export const adminRouter = createTRPCRouter({
  getPendingUsers: adminProcedure
    .query(async () => {
      const pendingUsers = await db.user.findMany({
        where: {
          role: 'GUEST',
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return pendingUsers;
    }),

  getApprovedUsers: adminProcedure
    .query(async () => {
      const approvedUsers = await db.user.findMany({
        where: {
          role: {
            in: ['USER', 'ADMIN']
          }
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return approvedUsers;
    }),

  approveUser: adminProcedure
    .input(z.object({
      userId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const updatedUser = await db.user.update({
        where: {
          id: input.userId,
        },
        data: {
          role: 'USER',
        },
      });

      return updatedUser;
    }),

  revokeAccess: adminProcedure
    .input(z.object({
      userId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (user.role === 'ADMIN') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: "Cannot revoke admin's access",
        });
      }

      const updatedUser = await db.user.update({
        where: { id: input.userId },
        data: { role: 'GUEST' },
      });

      return updatedUser;
    }),

  deleteUser: adminProcedure
    .input(z.object({
      userId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (user.role === 'ADMIN') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot delete an admin user',
        });
      }

      await db.user.delete({
        where: { id: input.userId },
      });

      return { success: true };
    }),

  addNewUser: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8).max(100),
    }))
    .mutation(async ({ input }) => {
      const existingUser = await db.user.findUnique({
        where: {
          email: input.email,
        },
      });

      if (existingUser) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User with this email already exists',
        });
      }

      const newUser = await auth.api.signUpEmail({
        body: {
            name: input.name,
            email: input.email,
            password: input.password,
        }
      })
        if (!newUser.user) {
            throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: "Failed to create user",
            });
        }
        await db.user.update({
            where: {
                id: newUser.user.id,
            },
            data: {
                role: 'USER',
            }
        });

      return newUser;
    }),

  makeAdmin: adminProcedure
    .input(z.object({
      userId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const updatedUser = await db.user.update({
        where: { id: input.userId },
        data: { role: 'ADMIN' },
      });

      return updatedUser;
    }),

  getWhatsAppSessions: adminProcedure
    .query(async () => {
      return await db.whatsAppSession.findMany({
        where: {
          status: "CONNECTED",
        },
        include: {
          WhatsAppGroups: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }),

  getWhatsAppGroups: adminProcedure
    .query(async () => {
      return await db.whatsAppGroup.findMany({
        include: {
          campaigns: {
            where: {
              isDeleted: false,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }),

  getActiveCampaigns: adminProcedure
    .query(async () => {
      return await db.messageCampaign.findMany({
        where: {
          isDeleted: false,
          status: {
            in: ['SCHEDULED', 'IN_PROGRESS'],
          },
        },
        include: {
          group: true,
        },
        orderBy: {
          startDate: 'asc',
        },
      });
    }),

  getCompletedCampaigns: adminProcedure
    .query(async () => {
      return await db.messageCampaign.findMany({
        where: {
          isDeleted: false,
          status: 'COMPLETED',
        },
        include: {
          group: true,
        },
        orderBy: {
          endDate: 'desc',
        },
      });
    }),

  getCampaignStats: adminProcedure
    .query(async () => {
      const [activeCampaigns, completedCampaigns] = await Promise.all([
        db.messageCampaign.count({
          where: {
            isDeleted: false,
            status: {
              in: ['SCHEDULED', 'IN_PROGRESS'],
            },
          },
        }),
        db.messageCampaign.count({
          where: {
            isDeleted: false,
            status: 'COMPLETED',
          },
        }),
      ]);

      return {
        active: activeCampaigns,
        completed: completedCampaigns,
        total: activeCampaigns + completedCampaigns,
      };
    }),

  getClubMembers: adminProcedure
    .query(async () => {
      const members = await db.clubMember.findMany({
        orderBy: {
          lastName: 'asc',
        },
      });
      return members;
    }),
});
