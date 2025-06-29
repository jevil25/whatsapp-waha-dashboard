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
        timeZone: z.string().default('America/Chicago'), // Time zone for scheduling
        messageTemplate: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { groupId, sessionId, startDate, endDate, messageTime, timeZone, messageTemplate, title, targetAmount } = input;

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

      const startDt = DateTime.fromISO(startDate, { zone: timeZone })
        .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
      
      const endDt = DateTime.fromISO(endDate, { zone: timeZone })
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
          timeZone,
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
            timeZone: true,
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

  updateCampaign: protectedProcedure
    .input(
      z.object({
        campaignId: z.string(),
        title: z.string().optional(),
        targetAmount: z.string().optional(),
        startDate: z.string(),
        endDate: z.string(),
        messageTime: z.string().regex(/^\d{1,2}:\d{2}$/),
        timeZone: z.string().default('America/Chicago'), // Time zone for scheduling
        messageTemplate: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { campaignId, startDate, endDate, messageTime, timeZone, messageTemplate, title, targetAmount } = input;

      // Validate time format
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

      // Check if campaign exists and belongs to user
      const existingCampaign = await ctx.db.messageCampaign.findFirst({
        where: { 
          id: campaignId,
          session: { userId: ctx.session.user.id },
          isDeleted: false 
        },
        include: {
          messages: {
            where: { isDeleted: false },
            orderBy: { scheduledAt: 'asc' }
          }
        }
      });

      if (!existingCampaign) {
        throw new Error("Campaign not found or access denied");
      }

      // Check if any messages have already been sent - use optional chaining for safety
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const hasSentMessages = existingCampaign.messages?.some((m: any) => m.isSent) ?? false;
      if (hasSentMessages) {
        throw new Error("Cannot edit campaign with messages that have already been sent");
      }

      const startDt = DateTime.fromISO(startDate, { zone: timeZone })
        .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
      
      const endDt = DateTime.fromISO(endDate, { zone: timeZone })
        .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

      if (!startDt.isValid || !endDt.isValid) {
        throw new Error("Invalid date format");
      }

      if (endDt < startDt) {
        throw new Error("End date must be after start date");
      }

      const sendTimeUtc = startDt.toUTC().toJSDate();

      // Calculate new messages
      const messages = [];
      let currentDate = startDt;

      while (currentDate <= endDt) {
        const scheduledDateUtc = currentDate.setZone("UTC").toJSDate();
        const endDateObj = endDt.toJSDate();
        const daysLeft = Math.ceil((endDateObj.getTime() - currentDate.toJSDate().getTime()) / (1000 * 60 * 60 * 24));

        let messageContent = '';
        
        if (title?.trim()) {
          messageContent += `Campaign Title: ${title}\n`;
        }
        
        messageContent += `Campaign Start Date: ${startDate}\n`;
        messageContent += `Campaign End Date: ${endDate}\n`;
        
        if (targetAmount?.trim()) {
          messageContent += `Contribution Target Amount: ${targetAmount}\n`;
        }
        
        messageContent += `Days Remaining: ${daysLeft}\n\n`;
        messageContent += messageTemplate.replace(/{days_left}/g, daysLeft.toString());

        messages.push({
          sessionId: existingCampaign.sessionId,
          content: messageContent,
          scheduledAt: scheduledDateUtc,
        });

        currentDate = currentDate.plus({ days: 1 });
      }

      // Mark existing unsent messages as deleted and create new ones
      await ctx.db.messageCampaign.update({
        where: { id: campaignId },
        data: {
          messages: {
            updateMany: {
              where: {
                MessageCampaignId: campaignId,
                isSent: false,
              },
              data: {
                isDeleted: true,
              },
            },
          },
        },
      });

      // Update campaign and create new messages
      const updatedCampaign = await ctx.db.messageCampaign.update({
        where: { id: campaignId },
        data: {
          title,
          targetAmount,
          startDate: startDt.toJSDate(),
          endDate: endDt.toJSDate(),
          sendTimeUtc,
          timeZone,
          template: messageTemplate,
          messages: {
            create: messages,
          },
        },
      });

      return {
        success: true,
        campaignId: updatedCampaign.id,
      };
    }),
});
