/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { DateTime } from "luxon";
import { deleteFromCloudinary } from "~/lib/cloudinary";
import { mediaSchema } from "~/types/media.schema";
import { addMediaToItem, convertImagesToMedia } from "~/utils/mediaHelpers";

export const messageCampaignRouter = createTRPCRouter({
  createCampaign: protectedProcedure
    .input(
      z.object({
        groupId: z.string(), // Can be either group ID or contact ID
        groupName: z.string(), // Can be either group name or contact name
        sessionId: z.string(),
        title: z.string().optional(), // Optional campaign title
        targetAmount: z.string().optional(), // Optional contribution target amount
        startDate: z.string(),
        endDate: z.string(),
        messageTime: z.string().regex(/^\d{1,2}:\d{2}$/),
        timeZone: z.string().default('America/Chicago'), // Time zone for scheduling
        messageTemplate: z.string(),
        isFreeForm: z.boolean().default(false),
        isRecurring: z.boolean(),
        recurrence: z.enum(['DAILY', 'WEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'SEMI_ANNUALLY', 'ANNUALLY']).default('DAILY'),
        audienceType: z.enum(['groups', 'individuals']).default('groups'), // New field to distinguish between groups and individuals
        images: z.array(z.object({
          url: z.string(),
          publicId: z.string(),
        })).optional(), // Array of uploaded images
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { groupId, sessionId, startDate, endDate, messageTime, timeZone, messageTemplate, title, targetAmount, isRecurring, recurrence } = input;

      const recurrenceDaysMap = {
        DAILY: 1,
        WEEKLY: 7,
        SEMI_MONTHLY: 15,
        MONTHLY: 30,
        SEMI_ANNUALLY: 182,
        ANNUALLY: 365,
      }

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

      const messages = [];
      let days_width = 1;

      if (isRecurring) {
        days_width = recurrenceDaysMap[recurrence];
      }

      // Split message template into sequence only if it contains asterisks
      const hasMessageSequence = messageTemplate.includes('*');
      const messageSequence = hasMessageSequence 
        ? messageTemplate.split('*').map(msg => msg.trim()).filter(msg => msg.length > 0)
        : [messageTemplate]; // If no asterisks, treat as single message
      
      // Calculate required message count and validate only if using message sequence
      if (isRecurring && hasMessageSequence) {
        const daysDiff = Math.ceil(endDt.diff(startDt, 'days').days) + 1; // +1 to include end date
        const requiredMessageCount = Math.ceil(daysDiff / recurrenceDaysMap[recurrence]);
        
        if (messageSequence.length !== requiredMessageCount) {
          throw new Error(
            `For the selected date range and ${recurrence.toLowerCase()} recurrence, ` +
            `you need exactly ${requiredMessageCount} unique message${requiredMessageCount > 1 ? 's' : ''} ` +
            `separated by asterisks (*). Or remove the asterisks to use the same message for all occurrences.`
          );
        }
      }

      let i = 0;
      let sequenceIndex = 0;
      const daysDiff = Math.ceil(endDt.diff(startDt, 'days').days) + 1;
      const sendTimeUtc = startDt.toUTC().toJSDate();

      while (i < daysDiff) {
        console.log(`Creating message for day ${i + 1} of ${daysDiff}`);
        const messageDate = startDt.plus({ days: i });
        const scheduledDateUtc = messageDate.toUTC().toJSDate();
        const daysLeft = daysDiff - i - 1; // -1 because we want to show 0 on the last day
        
        // Build message content with optional fields
        let messageContent = '';
        
        // Add title if provided
        if (!input.isFreeForm) {
          if (title) {
            messageContent += `Campaign Title: ${title}\n`;
          }
          
          messageContent += `Campaign Start Date: ${startDt.toFormat('yyyy-LL-dd')}\n`;
          messageContent += `Campaign End Date: ${endDt.toFormat('yyyy-LL-dd')}\n`;
          
          if (targetAmount) {
            messageContent += `Contribution Target Amount: ${targetAmount}\n`;
          }
          
          messageContent += `Days Remaining: ${daysLeft}\n\n`;
        }

        // Select and add appropriate message from sequence
        const messageText = isRecurring && messageSequence.length > 0
          ? messageSequence[sequenceIndex % messageSequence.length]
          : messageTemplate;
        messageContent += messageText?.replace(/{days_left}/g, daysLeft.toString());

        // Handle image assignment based on frequency
        let imageUrl: string | undefined;
        let imagePublicId: string | undefined;
        let hasImage = false;

        if (input.images && input.images.length > 0) {
          hasImage = true;
          if (isRecurring && input.images.length > 1) {
            // For recurring campaigns with multiple images, cycle through them
            const imageIndex = sequenceIndex % input.images.length;
            imageUrl = input.images[imageIndex]?.url;
            imagePublicId = input.images[imageIndex]?.publicId;
          } else {
            // For one-time campaigns or single image, use the first image for all messages
            imageUrl = input.images[0]?.url;
            imagePublicId = input.images[0]?.publicId;
          }
        }

        messages.push({
          sessionId,
          content: messageContent,
          scheduledAt: scheduledDateUtc,
          hasImage,
          imageUrl,
          imagePublicId,
        });

        i = i + days_width;
        sequenceIndex++;
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
          isRecurring,
          recurrence,
          isFreeForm: input.isFreeForm,
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
  createStatus: protectedProcedure
  .input(
    z.object({
      statusText: z.string().optional(),
      backgroundColor: z.string().optional(),
      font: z.number().optional(),
      sessionId: z.string(),
      title: z.string().optional(), // Optional status campaign title
      startDate: z.string(),
      endDate: z.string(),
      messageTime: z.string().regex(/^\d{1,2}:\d{2}$/),
      timeZone: z.string().default('America/Chicago'), // Time zone for scheduling
      isFreeForm: z.boolean().default(false),
      isRecurring: z.boolean(),
      recurrence: z.enum(['DAILY', 'WEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'SEMI_ANNUALLY', 'ANNUALLY']).default('DAILY'),
      images: z.array(z.object({
        url: z.string(),
        publicId: z.string(),
      })).optional(), 
    })
  )
  .mutation(async ({ ctx, input }) => {
    const { sessionId, startDate, endDate, messageTime, timeZone, statusText, title, isRecurring, recurrence } = input;

    const recurrenceDaysMap = {
      DAILY: 1,
      WEEKLY: 7,
      SEMI_MONTHLY: 15,
      MONTHLY: 30,
      SEMI_ANNUALLY: 182,
      ANNUALLY: 365,
    }

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

    const statuses = [];
    let days_width = 1;

    if (isRecurring) {
      days_width = recurrenceDaysMap[recurrence];
    }

    // Split status template into sequence only if it contains asterisks
    const statusTemplate = statusText || '';
    const hasStatusSequence = statusTemplate.includes('*');
    const statusSequence = hasStatusSequence 
      ? statusTemplate.split('*').map(msg => msg.trim()).filter(msg => msg.length > 0)
      : [statusTemplate]; // If no asterisks, treat as single status
    
    // Calculate required status count and validate only if using status sequence
    if (isRecurring && hasStatusSequence) {
      const daysDiff = Math.ceil(endDt.diff(startDt, 'days').days) + 1; // +1 to include end date
      const requiredStatusCount = Math.ceil(daysDiff / recurrenceDaysMap[recurrence]);
      
      if (statusSequence.length !== requiredStatusCount) {
        throw new Error(
          `For the selected date range and ${recurrence.toLowerCase()} recurrence, ` +
          `you need exactly ${requiredStatusCount} unique status${requiredStatusCount > 1 ? 'es' : ''} ` +
          `separated by asterisks (*). Or remove the asterisks to use the same status for all occurrences.`
        );
      }
    }

    let i = 0;
    let sequenceIndex = 0;
    const daysDiff = Math.ceil(endDt.diff(startDt, 'days').days) + 1;
    const sendTimeUtc = startDt.toUTC().toJSDate();

    while (i < daysDiff) {
      console.log(`Creating status for day ${i + 1} of ${daysDiff}`);
      const statusDate = startDt.plus({ days: i });
      const scheduledDateUtc = statusDate.toUTC().toJSDate();
      const daysLeft = daysDiff - i - 1; // -1 because we want to show 0 on the last day
      
      // Build status content
      let statusContent = '';
      
      // Add title if provided and not free form
      if (!input.isFreeForm) {
        if (title) {
          statusContent += `Status Campaign: ${title}\n`;
        }
        
        statusContent += `Campaign Start Date: ${startDt.toFormat('yyyy-LL-dd')}\n`;
        statusContent += `Campaign End Date: ${endDt.toFormat('yyyy-LL-dd')}\n`;
        statusContent += `Days Remaining: ${daysLeft}\n\n`;
      }

      // Select and add appropriate status from sequence
      const statusText = isRecurring && statusSequence.length > 0
        ? statusSequence[sequenceIndex % statusSequence.length]
        : statusTemplate;
      statusContent += statusText?.replace(/{days_left}/g, daysLeft.toString());

      // Handle image assignment based on frequency
      let imageUrl: string | undefined;
      let imagePublicId: string | undefined;
      let hasImage = false;

      if (input.images && input.images.length > 0) {
        hasImage = true;
        if (isRecurring && input.images.length > 1) {
          // For recurring statuses with multiple images, cycle through them
          const imageIndex = sequenceIndex % input.images.length;
          imageUrl = input.images[imageIndex]?.url;
          imagePublicId = input.images[imageIndex]?.publicId;
        } else {
          // For one-time statuses or single image, use the first image for all statuses
          imageUrl = input.images[0]?.url;
          imagePublicId = input.images[0]?.publicId;
        }
      }

      statuses.push({
        sessionId,
        content: statusContent,
        scheduledAt: scheduledDateUtc,
        hasImage,
        imageUrl,
        imagePublicId,
      });

      i = i + days_width;
      sequenceIndex++;
    }

    // Create the StatusCampaign first
    const statusCampaign = await ctx.db.statusCampaign.create({
      data: {
        sessionId,
        title,
        startDate: startDt.toJSDate(),
        endDate: endDt.toJSDate(),
        sendTimeUtc,
        timeZone,
        template: statusTemplate,
        status: "SCHEDULED",
        isRecurring,
        recurrence,
        isFreeForm: input.isFreeForm,
        statuses: {
          create: statuses.map(status => ({
            ...status,
            // Remove StatusCampaignId since it will be set automatically through the relation
          })),
        },
      },
    });

    return {
      success: true,
      statusCampaignId: statusCampaign.id,
      statusCount: statuses.length,
      message: `Successfully scheduled ${statuses.length} status update${statuses.length > 1 ? 's' : ''}`,
    };
  }),
  getCompletedCampaigns: protectedProcedure
  .query(async ({ ctx }) => {
    try {
      // Get completed campaigns
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
          isRecurring: true,
          recurrence: true,
          isFreeForm: true,
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
              hasImage: true,
              imageUrl: true,
              imagePublicId: true,
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

      // Get completed statuses
      const statuses = await ctx.db.statusCampaign.findMany({
        where: {
          isDeleted: false,
          statuses: {
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
          startDate: true,
          endDate: true,
          sendTimeUtc: true,
          timeZone: true,
          template: true,
          status: true,
          createdAt: true,
          isRecurring: true,
          recurrence: true,
          isFreeForm: true,
          statuses: {
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
              hasImage: true,
              imageUrl: true,
              imagePublicId: true,
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
          

      const filteredCampaigns = campaigns.filter(campaign => campaign.group !== null);

      return {
        campaigns: filteredCampaigns,
        statuses: statuses,
        totalCompleted: filteredCampaigns.length + statuses.length
      };
    } catch (error) {
      console.error('Error fetching completed campaigns and statuses:', error);
      throw new Error('Failed to fetch completed campaigns and statuses');
    }
  }),

getCampaigns: protectedProcedure
  .query(async ({ ctx }) => {
    try {
      // Get active campaigns
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
          isRecurring: true,
          recurrence: true,
          isFreeForm: true,
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
              hasImage: true,
              imageUrl: true,
              imagePublicId: true,
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

      // Get active statuses
      const statuses = await ctx.db.statusCampaign.findMany({
        where: {
          isDeleted: false,
          statuses: {
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
          startDate: true,
          endDate: true,
          sendTimeUtc: true,
          timeZone: true,
          template: true,
          status: true,
          createdAt: true,
          isRecurring: true,
          recurrence: true,
          isFreeForm: true,
          statuses: {
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
              hasImage: true,
              imageUrl: true,
              imagePublicId: true,
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

      const filteredCampaigns = campaigns.filter(campaign => campaign.group !== null);

      return {
        campaigns: filteredCampaigns,
        statuses: statuses,
        totalActive: filteredCampaigns.length + statuses.length
      };
    } catch (error) {
      console.error('Error fetching campaigns and statuses:', error);
      throw new Error('Failed to fetch campaigns and statuses');
    }
  }),
  deleteCampaign: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db.messageCampaign.update({
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
        select: {
          messages: {
            select: {
              imagePublicId: true,
            },
          },
        },
      });
      const imagePublicId = res.messages.map(msg => msg.imagePublicId).filter(id => id);
      await Promise.all(imagePublicId.map(id => deleteFromCloudinary(id ?? "")));
      return { success: true };
    }),
  deleteStatus: protectedProcedure
    .input(z.object({
      statusId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db.statusCampaign.update({
        where: { id: input.statusId, session: { userId: ctx.session.user.id } },
        data: {
          isDeleted: true,
          statuses: {
            updateMany: {
              where: {
                StatusCampaignId: input.statusId,
              },
              data: {
                isDeleted: true,
              },
            }
          },
        },
        select: {
          statuses: {
            select: {
              imagePublicId: true,
            },
          },
        },
      });
      const imagePublicId = res.statuses.map(status => status.imagePublicId).filter(id => id);
      await Promise.all(imagePublicId.map(id => deleteFromCloudinary(id ?? "")));
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
        isRecurring: z.boolean(),
        isFreeForm: z.boolean().default(false),
        recurrence: z.enum(['DAILY', 'WEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'SEMI_ANNUALLY', 'ANNUALLY']).default('DAILY'),
        audienceType: z.enum(['groups', 'individuals']).default('groups').optional(), // New field to distinguish between groups and individuals
        images: z.array(z.object({
          url: z.string(),
          publicId: z.string(),
        })).optional(), // Array of uploaded images
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { campaignId, startDate, endDate, messageTime, timeZone, messageTemplate, title, targetAmount, isRecurring, recurrence } = input;

      const recurrenceDaysMap = {
        DAILY: 1,
        WEEKLY: 7,
        SEMI_MONTHLY: 15,
        MONTHLY: 30,
        SEMI_ANNUALLY: 182,
        ANNUALLY: 365,
      }

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

      // Allow editing campaigns even after some messages have been sent
      // We'll only update future unsent messages and preserve already sent ones
      const now = new Date();
      const hasFutureMessages = existingCampaign.messages?.some((m: any) => !m.isSent && new Date(m.scheduledAt as Date) > now) ?? false;
      
      // If there are no future messages and the campaign has already started, 
      // we still allow editing to extend the campaign or modify the template for new messages
      console.log(`Campaign ${campaignId} has future messages: ${hasFutureMessages}`);

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

      // Split message template into sequence only if it contains asterisks
      const hasMessageSequence = messageTemplate.includes('*');
      const messageSequence = hasMessageSequence 
        ? messageTemplate.split('*').map(msg => msg.trim()).filter(msg => msg.length > 0)
        : [messageTemplate]; // If no asterisks, treat as single message
      
      // Calculate required message count and validate only if using message sequence
      if (isRecurring && hasMessageSequence) {
        const daysDiff = Math.ceil(endDt.diff(startDt, 'days').days) + 1; // +1 to include end date
        const requiredMessageCount = Math.ceil(daysDiff / recurrenceDaysMap[recurrence]);
        
        if (messageSequence.length !== requiredMessageCount) {
          throw new Error(
            `For the selected date range and ${recurrence.toLowerCase()} recurrence, ` +
            `you need exactly ${requiredMessageCount} unique message${requiredMessageCount > 1 ? 's' : ''} ` +
            `separated by asterisks (*). Or remove the asterisks to use the same message for all occurrences.`
          );
        }
      }

      let days_width = 1;
      if (isRecurring) {
        days_width = recurrenceDaysMap[recurrence];
      }

      // Generate messages for future dates only
      // This prevents recreating messages for dates that have already passed or have been sent
      let currentDate = startDt;
      let sequenceIndex = 0;
      const futureTime = new Date();
      
      while (currentDate <= endDt) {
        const scheduledDateUtc = currentDate.setZone("UTC").toJSDate();
        
        // Only create messages for future dates
        if (scheduledDateUtc > futureTime) {
          const endDateObj = endDt.toJSDate();
          const daysLeft = Math.ceil((endDateObj.getTime() - currentDate.toJSDate().getTime()) / (1000 * 60 * 60 * 24));

          // Build message content with optional fields
          let messageContent = '';
          
          if (!input.isFreeForm) {
            if (title?.trim()) {
              messageContent += `Campaign Title: ${title}\n`;
            }
            
            messageContent += `Campaign Start Date: ${startDate}\n`;
            messageContent += `Campaign End Date: ${endDate}\n`;
            
            if (targetAmount?.trim()) {
              messageContent += `Contribution Target Amount: ${targetAmount}\n`;
            }
            
            messageContent += `Days Remaining: ${daysLeft}\n\n`;
          }

          // Select and add appropriate message from sequence
          const messageText = isRecurring && messageSequence.length > 0
            ? messageSequence[sequenceIndex % messageSequence.length]
            : messageTemplate;
          messageContent += messageText?.replace(/{days_left}/g, daysLeft.toString());

          // Handle image assignment based on frequency for update
          let imageUrl: string | undefined;
          let imagePublicId: string | undefined;
          let hasImage = false;

          if (input.images && input.images.length > 0) {
            hasImage = true;
            if (isRecurring && input.images.length > 1) {
              // For recurring campaigns with multiple images, cycle through them
              const imageIndex = sequenceIndex % input.images.length;
              imageUrl = input.images[imageIndex]?.url;
              imagePublicId = input.images[imageIndex]?.publicId;
            } else {
              // For one-time campaigns or single image, use the first image for all messages
              imageUrl = input.images[0]?.url;
              imagePublicId = input.images[0]?.publicId;
            }
          }

          messages.push({
            sessionId: existingCampaign.sessionId,
            content: messageContent,
            scheduledAt: scheduledDateUtc,
            hasImage,
            imageUrl,
            imagePublicId,
          });
        }

        currentDate = currentDate.plus({ days: days_width });
        sequenceIndex++;
      }

      // Mark existing unsent messages that are scheduled for the future as deleted and create new ones
      // This preserves already sent messages and any messages that are about to be sent
      const currentTime = new Date();
      await ctx.db.messageCampaign.update({
        where: { id: campaignId },
        data: {
          messages: {
            updateMany: {
              where: {
                MessageCampaignId: campaignId,
                isSent: false,
                scheduledAt: { gt: currentTime }, // Only delete future unsent messages
              },
              data: {
                isDeleted: true,
              },
            },
          },
        },
      });

      // delete the images from cloud storage if not using them anymore
      if (existingCampaign.messages) {
        const existingImagePublicIds = existingCampaign.messages
          .filter((m) => m.hasImage && m.imagePublicId)
          .map((m) => m.imagePublicId)
        const newImagePublicIds = input.images?.map(img => img.publicId) || [];
        const imagesToDelete = existingImagePublicIds.filter(id => !newImagePublicIds.includes(id || ""));
        if (imagesToDelete.length > 0) {
          await Promise.all(imagesToDelete.map(async (publicId) => {
            await deleteFromCloudinary(publicId || "");
          }));
        }
      }

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
          recurrence,
          isRecurring,
          isFreeForm: input.isFreeForm,
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
    updateStatus: protectedProcedure
  .input(
    z.object({
      statusCampaignId: z.string(), // Changed from statusId to statusCampaignId
      title: z.string().optional(), // Added title field
      statusText: z.string().optional(),
      backgroundColor: z.string().optional(),
      font: z.number().optional(),
      startDate: z.string(),
      endDate: z.string(),
      messageTime: z.string().regex(/^\d{1,2}:\d{2}$/),
      timeZone: z.string().default('America/Chicago'),
      isFreeForm: z.boolean().default(false), // Added isFreeForm field
      isRecurring: z.boolean(),
      recurrence: z.enum(['DAILY', 'WEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'SEMI_ANNUALLY', 'ANNUALLY']).default('DAILY'),
      images: z.array(z.object({
        url: z.string(),
        publicId: z.string(),
      })).optional(), 
    })
  )
  .mutation(async ({ ctx, input }) => {
    const { statusCampaignId, title, startDate, endDate, messageTime, timeZone, statusText, isRecurring, recurrence } = input;

    const recurrenceDaysMap = {
      DAILY: 1,
      WEEKLY: 7,
      SEMI_MONTHLY: 15,
      MONTHLY: 30,
      SEMI_ANNUALLY: 182,
      ANNUALLY: 365,
    }

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

    // Check if status campaign exists and belongs to user
    const existingStatusCampaign = await ctx.db.statusCampaign.findFirst({
      where: { 
        id: statusCampaignId,
        session: { userId: ctx.session.user.id },
        isDeleted: false 
      },
      include: {
        statuses: {
          where: { isDeleted: false },
          orderBy: { scheduledAt: 'asc' }
        }
      }
    });

    if (!existingStatusCampaign) {
      throw new Error("Status campaign not found or access denied");
    }

    // Allow editing campaigns even after some statuses have been sent
    // We'll only update future unsent statuses and preserve already sent ones
    const now = new Date();
    const hasFutureStatuses = existingStatusCampaign.statuses?.some((s: any) => !s.isSent && new Date(s.scheduledAt as Date) > now) ?? false;
    
    console.log(`Status campaign ${statusCampaignId} has future statuses: ${hasFutureStatuses}`);

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

    // Calculate new statuses
    const statuses = [];
    const statusTemplate = statusText || '';

    // Split status template into sequence only if it contains asterisks
    const hasStatusSequence = statusTemplate.includes('*');
    const statusSequence = hasStatusSequence 
      ? statusTemplate.split('*').map(msg => msg.trim()).filter(msg => msg.length > 0)
      : [statusTemplate]; // If no asterisks, treat as single status
    
    // Calculate required status count and validate only if using status sequence
    if (isRecurring && hasStatusSequence) {
      const daysDiff = Math.ceil(endDt.diff(startDt, 'days').days) + 1; // +1 to include end date
      const requiredStatusCount = Math.ceil(daysDiff / recurrenceDaysMap[recurrence]);
      
      if (statusSequence.length !== requiredStatusCount) {
        throw new Error(
          `For the selected date range and ${recurrence.toLowerCase()} recurrence, ` +
          `you need exactly ${requiredStatusCount} unique status${requiredStatusCount > 1 ? 'es' : ''} ` +
          `separated by asterisks (*). Or remove the asterisks to use the same status for all occurrences.`
        );
      }
    }

    let days_width = 1;
    if (isRecurring) {
      days_width = recurrenceDaysMap[recurrence];
    }

    // Generate statuses for future dates only
    let currentDate = startDt;
    let sequenceIndex = 0;
    const futureTime = new Date();
    
    while (currentDate <= endDt) {
      const scheduledDateUtc = currentDate.setZone("UTC").toJSDate();
      
      // Only create statuses for future dates
      if (scheduledDateUtc > futureTime) {
        const endDateObj = endDt.toJSDate();
        const daysLeft = Math.ceil((endDateObj.getTime() - currentDate.toJSDate().getTime()) / (1000 * 60 * 60 * 24));

        // Build status content
        let statusContent = '';
        
        // Add title if provided and not free form
        if (!input.isFreeForm) {
          if (title?.trim()) {
            statusContent += `Status Campaign: ${title}\n`;
          }
          
          statusContent += `Campaign Start Date: ${startDate}\n`;
          statusContent += `Campaign End Date: ${endDate}\n`;
          statusContent += `Days Remaining: ${daysLeft}\n\n`;
        }

        // Select and add appropriate status from sequence
        const statusText = isRecurring && statusSequence.length > 0
          ? statusSequence[sequenceIndex % statusSequence.length]
          : statusTemplate;
        statusContent += statusText?.replace(/{days_left}/g, daysLeft.toString());

        // Handle image assignment based on frequency
        let imageUrl: string | undefined;
        let imagePublicId: string | undefined;
        let hasImage = false;

        if (input.images && input.images.length > 0) {
          hasImage = true;
          if (isRecurring && input.images.length > 1) {
            // For recurring status campaigns with multiple images, cycle through them
            const imageIndex = sequenceIndex % input.images.length;
            imageUrl = input.images[imageIndex]?.url;
            imagePublicId = input.images[imageIndex]?.publicId;
          } else {
            // For one-time status campaigns or single image, use the first image for all statuses
            imageUrl = input.images[0]?.url;
            imagePublicId = input.images[0]?.publicId;
          }
        }

        statuses.push({
          sessionId: existingStatusCampaign.sessionId,
          content: statusContent,
          scheduledAt: scheduledDateUtc,
          hasImage,
          imageUrl,
          imagePublicId,
        });
      }

      currentDate = currentDate.plus({ days: days_width });
      sequenceIndex++;
    }

    // Mark existing unsent statuses that are scheduled for the future as deleted and create new ones
    // This preserves already sent statuses and any statuses that are about to be sent
    const currentTime = new Date();
    await ctx.db.statusCampaign.update({
      where: { id: statusCampaignId },
      data: {
        statuses: {
          updateMany: {
            where: {
              StatusCampaignId: statusCampaignId,
              isSent: false,
              scheduledAt: { gt: currentTime }, // Only delete future unsent statuses
            },
            data: {
              isDeleted: true,
            },
          },
        },
      },
    });

    // Delete the images from cloud storage if not using them anymore
    if (existingStatusCampaign.statuses) {
      const existingImagePublicIds = existingStatusCampaign.statuses
        .filter((s) => s.hasImage && s.imagePublicId)
        .map((s) => s.imagePublicId);
      const newImagePublicIds = input.images?.map(img => img.publicId) || [];
      const imagesToDelete = existingImagePublicIds.filter(id => !newImagePublicIds.includes(id || ""));
      if (imagesToDelete.length > 0) {
        await Promise.all(imagesToDelete.map(async (publicId) => {
          await deleteFromCloudinary(publicId || "");
        }));
      }
    }

    // Update status campaign and create new statuses
    const updatedStatusCampaign = await ctx.db.statusCampaign.update({
      where: { id: statusCampaignId },
      data: {
        title,
        startDate: startDt.toJSDate(),
        endDate: endDt.toJSDate(),
        sendTimeUtc,
        timeZone,
        template: statusTemplate,
        recurrence,
        isRecurring,
        isFreeForm: input.isFreeForm,
        statuses: {
          create: statuses,
        },
      },
    });

    return {
      success: true,
      statusCampaignId: updatedStatusCampaign.id,
      statusCount: statuses.length,
      message: `Successfully updated and scheduled ${statuses.length} status update${statuses.length > 1 ? 's' : ''}`,
    };
  }),
});
