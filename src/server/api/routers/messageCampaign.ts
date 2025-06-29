/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { DateTime } from "luxon";

export const messageCampaignRouter = createTRPCRouter({
  createCampaign: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        groupName: z.string(),
        sessionId: z.string(),
        title: z.string().optional(), // Optional campaign title
        targetAmount: z.string().optional(), // Optional contribution target amount
        startDate: z.string(),
        endDate: z.string(),
        messageTime: z.string().regex(/^\d{1,2}:\d{2}$/),
        messageTemplate: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { groupId, sessionId, startDate, endDate, messageTime, messageTemplate, title, targetAmount } = input;

      const timeRegex = new RegExp(/^(\d{1,2}):(\d{2})$/);
      const timeMatch = timeRegex.exec(messageTime);
      if (!timeMatch?.[1] || !timeMatch?.[2]) {
        throw new Error("Invalid time format");
      }

      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);

      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error("Invalid time values");
      }

      const startDt = DateTime.fromISO(startDate, { zone: "America/Chicago" })
        .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
      
      const endDt = DateTime.fromISO(endDate, { zone: "America/Chicago" })
        .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

      if (!startDt.isValid || !endDt.isValid) {
        throw new Error("Invalid date format");
      }

      if (endDt < startDt) {
        throw new Error("End date must be after start date");
      }

      const daysDiff = Math.ceil(endDt.diff(startDt, 'days').days);

      const sendTimeUtc = startDt.toUTC().toJSDate();

      const messages = [];
      for (let i = 0; i <= daysDiff; i++) {
        const messageDate = startDt.plus({ days: i });
        
        const scheduledDateUtc = messageDate.toUTC().toJSDate();

        const daysLeft = daysDiff - i;
        if (daysLeft < 1) continue;
        
        // Build message content with optional fields
        let messageContent = '';
        
        // Add title if provided
        if (title) {
          messageContent += `Campaign Title: ${title}\n`;
        }
        
        messageContent += `Campaign Start Date: ${startDt.toFormat('yyyy-LL-dd')}\n`;
        messageContent += `Campaign End Date: ${endDt.toFormat('yyyy-LL-dd')}\n`;
        
        if (targetAmount) {
          messageContent += `Contribution Target Amount: ${targetAmount}\n`;
        }
        
        messageContent += `Days Remaining: ${daysLeft}\n\n`;
        messageContent += messageTemplate.replace(/{days_left}/g, daysLeft.toString());

        messages.push({
          sessionId,
          content: messageContent,
          scheduledAt: scheduledDateUtc,
        });
      }

      let group = await ctx.db.whatsAppGroup.findUnique({
        where: { 
            groupId_sessionId:{
                groupId: groupId,
                sessionId: sessionId,
            } 
        },
      });
        if (!group) {
            group = await ctx.db.whatsAppGroup.create({
                data: {
                    groupId: groupId,
                    groupName: input.groupName,
                    sessionId: sessionId,
                },
            });
        }


      const campaign = await ctx.db.messageCampaign.create({
        data: {
          groupId: group.id,
          sessionId,
          title,
          targetAmount,
          startDate: startDt.toJSDate(),
          endDate: endDt.toJSDate(),
          sendTimeUtc,
          template: messageTemplate,
          status: "SCHEDULED",
          messages: {
            create: messages,
          },
        },
      });

      return {
        success: true,
        campaignId: campaign.id,
      };
    }),

  getCompletedCampaigns: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const campaigns = await ctx.db.messageCampaign.findMany({
          where: {
            isDeleted: false,
            messages: {
                every: {
                    OR: [
                        { isSent: true },
                        { scheduledAt: { lt: new Date() } },
                    ]
                }
            },
            session: {
              userId: ctx.session.user.id,
            }
          },
          select: {
            id: true,
            title: true,
            targetAmount: true,
            startDate: true,
            endDate: true,
            sendTimeUtc: true,
            template: true,
            status: true,
            createdAt: true,
            group: {
              select: {
                id: true,
                groupName: true,
                groupId: true,
              }
            },
            messages: {
              where: {
                isDeleted: false,
              },
              select: {
                id: true,
                content: true,
                scheduledAt: true,
                sentAt: true,
                isSent: true,
                isFailed: true,
              },
              orderBy: {
                scheduledAt: 'asc'
              },
            },
          },
          orderBy: {
            endDate: 'desc'
          },
        });

        return campaigns.filter(campaign => campaign.group !== null);
      } catch (error) {
        console.error('Error fetching completed campaigns:', error);
        throw new Error('Failed to fetch completed campaigns');
      }
    }),

  getCampaigns: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const campaigns = await ctx.db.messageCampaign.findMany({
          where: {
            isDeleted: false,
            messages: {
                some: {
                    scheduledAt: { gt: new Date() },
                }
            },
            session: {
              userId: ctx.session.user.id,
            }
          },
          select: {
            id: true,
            title: true,
            targetAmount: true,
            startDate: true,
            endDate: true,
            sendTimeUtc: true,
            template: true,
            status: true,
            createdAt: true,
            group: {
              select: {
                id: true,
                groupName: true,
                groupId: true,
              }
            },
            messages: {
              where: {
                isDeleted: false,
              },
              select: {
                id: true,
                content: true,
                scheduledAt: true,
                sentAt: true,
                isSent: true,
                isFailed: true,
              },
              orderBy: {
                scheduledAt: 'asc'
              },
            },
          },
          orderBy: {
            createdAt: 'desc'
          },
        });

        return campaigns.filter(campaign => campaign.group !== null);
      } catch (error) {
        console.error('Error fetching campaigns:', error);
        throw new Error('Failed to fetch campaigns');
      }
    }),

  deleteCampaign: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.messageCampaign.update({
        where: { id: input.campaignId, session: { userId: ctx.session.user.id } },
        data: { 
            isDeleted: true,
            messages: {
              updateMany: {
                where: {
                    MessageCampaignId: input.campaignId,
                },
                data: {
                    isDeleted: true,
                },
              }
            },
        },
      });

      return { success: true };
    }),
});
