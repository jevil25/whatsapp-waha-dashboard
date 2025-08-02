/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { DateTime } from "luxon";
import { deleteFromCloudinary } from "~/lib/cloudinary";
import { mediaSchema } from "~/types/media.schema";
import { addMediaToItem } from "~/utils/mediaHelpers";

// Base schema for campaign input
const campaignInput = {
  sessionId: z.string(),
  title: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  messageTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  timeZone: z.string().default('America/Chicago'),
  isRecurring: z.boolean(),
  isFreeForm: z.boolean().default(false),
  recurrence: z.enum(['DAILY', 'WEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'SEMI_ANNUALLY', 'ANNUALLY']).default('DAILY'),
  media: z.array(mediaSchema).optional(),
};

// Create the router with updated media support
export const messageCampaignRouterV2 = createTRPCRouter({
  createCampaign: protectedProcedure
    .input(z.object({
      ...campaignInput,
      groupId: z.string(),
      groupName: z.string(),
      targetAmount: z.string().optional(),
      messageTemplate: z.string(),
      audienceType: z.enum(['groups', 'individuals']).default('groups'),
    }))
    .mutation(async ({ ctx, input }) => {
      const {
        groupId, sessionId, startDate, endDate, messageTime, timeZone, 
        messageTemplate, title, targetAmount, isRecurring, recurrence, media
      } = input;

      const recurrenceDaysMap = {
        DAILY: 1,
        WEEKLY: 7,
        SEMI_MONTHLY: 15,
        MONTHLY: 30,
        SEMI_ANNUALLY: 182,
        ANNUALLY: 365,
      };

      const timeRegex = new RegExp(/^(\d{1,2}):(\d{2})$/);
      const timeMatch = timeRegex.exec(messageTime);
      if (!timeMatch) throw new Error('Invalid time format');

      const [_, hours, minutes] = timeMatch;
      const messageHour = parseInt(hours ? hours : '0');
      const messageMinute = parseInt(minutes ? minutes : '0');

      // Parse dates in the campaign time zone
      const startDt = DateTime.fromISO(startDate).setZone(timeZone).set({
        hour: messageHour,
        minute: messageMinute,
      });

      const endDt = DateTime.fromISO(endDate).setZone(timeZone).set({
        hour: messageHour,
        minute: messageMinute,
      });

      // Ensure start date is in the future
      const now = DateTime.now().setZone(timeZone);
      if (startDt < now) {
        throw new Error('Start date must be in the future');
      }

      // Ensure end date is after start date
      if (endDt < startDt) {
        throw new Error('End date must be after start date');
      }

      // For non-recurring campaigns, make end date same as start date
      const finalEndDt = !isRecurring ? startDt : endDt;

      // Calculate total days and required sequence length
      const daysDiff = Math.ceil(finalEndDt.diff(startDt, 'days').days) + 1;
      const messageSequence = messageTemplate.split('*').filter(msg => msg.trim().length > 0);

      // Validate message sequence if using * separator
      if (messageTemplate.includes('*')) {
        if (!isRecurring || !recurrence) {
          throw new Error('Message sequence (*) can only be used with recurring campaigns');
        }

        const requiredCount = Math.ceil(daysDiff / recurrenceDaysMap[recurrence]);
        if (messageSequence.length !== requiredCount) {
          throw new Error(
            `For ${recurrence.toLowerCase()} recurrence over ${daysDiff} days, ` +
            `you need exactly ${requiredCount} messages separated by *. ` +
            `Or remove the asterisks to use the same message for all occurrences.`
          );
        }
      }

      // Prepare messages array
      const messages = [];

      let sequenceIndex = 0;
      let currentDate = startDt;
      const days_width = isRecurring ? recurrenceDaysMap[recurrence] : 1;

      // Create message for each day
      while (currentDate <= finalEndDt) {
        const scheduledDateUtc = currentDate.toUTC().toJSDate();
        const daysLeft = Math.ceil((finalEndDt.toJSDate().getTime() - currentDate.toJSDate().getTime()) / (1000 * 60 * 60 * 24));

        // Build message content
        let messageContent = '';
        if (!input.isFreeForm) {
          if (title?.trim()) {
            messageContent += `Campaign: ${title}\n`;
          }
          messageContent += `Campaign Start Date: ${startDate}\n`;
          messageContent += `Campaign End Date: ${endDate}\n`;
          if (targetAmount?.trim()) {
            messageContent += `Target Amount: ${targetAmount}\n`;
          }
          messageContent += `Days Remaining: ${daysLeft}\n\n`;
        }

        // Select appropriate message from sequence
        const messageText = isRecurring && messageSequence.length > 0
          ? messageSequence[sequenceIndex % messageSequence.length]
          : messageTemplate;
        messageContent += messageText?.replace(/{days_left}/g, daysLeft.toString());

        // Add media metadata
        const mediaMetadata = media && media.length > 0 
          ? addMediaToItem({}, media, sequenceIndex)
          : addMediaToItem({});

        messages.push({
          sessionId,
          content: messageContent,
          scheduledAt: scheduledDateUtc,
          ...mediaMetadata
        });

        currentDate = currentDate.plus({ days: days_width });
        sequenceIndex++;
      }

      // Find or create group
      let group = await ctx.db.whatsAppGroup.findUnique({
        where: { 
          groupId_sessionId: {
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

      // Create the campaign with messages
      const campaign = await ctx.db.messageCampaign.create({
        data: {
          groupId: group.id,
          sessionId,
          title,
          targetAmount,
          startDate: startDt.toJSDate(),
          endDate: finalEndDt.toJSDate(),
          sendTimeUtc: startDt.toUTC().toJSDate(),
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
    .input(z.object({
      ...campaignInput,
      statusText: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { sessionId, startDate, endDate, messageTime, timeZone, statusText, title, 
        isRecurring, recurrence, media } = input;

      const recurrenceDaysMap = {
        DAILY: 1,
        WEEKLY: 7,
        SEMI_MONTHLY: 15,
        MONTHLY: 30,
        SEMI_ANNUALLY: 182,
        ANNUALLY: 365,
      };

      const timeRegex = new RegExp(/^(\d{1,2}):(\d{2})$/);
      const timeMatch = timeRegex.exec(messageTime);
      if (!timeMatch) throw new Error('Invalid time format');

      const [_, hours, minutes] = timeMatch;
      const messageHour = parseInt(hours ? hours : '0');
      const messageMinute = parseInt(minutes ? minutes : '0');

      // Parse dates
      const startDt = DateTime.fromISO(startDate).setZone(timeZone).set({
        hour: messageHour,
        minute: messageMinute,
      });

      const endDt = DateTime.fromISO(endDate).setZone(timeZone).set({
        hour: messageHour,
        minute: messageMinute,
      });

      // Ensure start date is in the future
      const now = DateTime.now().setZone(timeZone);
      if (startDt < now) {
        throw new Error('Start date must be in the future');
      }

      // Ensure end date is after start date
      if (endDt < startDt) {
        throw new Error('End date must be after start date');
      }

      // For non-recurring campaigns, make end date same as start date
      const finalEndDt = !isRecurring ? startDt : endDt;

      // Calculate total days and required sequence length
      const daysDiff = Math.ceil(finalEndDt.diff(startDt, 'days').days) + 1;
      const statusSequence = statusText.split('*').filter(msg => msg.trim().length > 0);

      // Validate status sequence if using * separator
      if (statusText.includes('*')) {
        if (!isRecurring || !recurrence) {
          throw new Error('Status sequence (*) can only be used with recurring status updates');
        }

        const requiredCount = Math.ceil(daysDiff / recurrenceDaysMap[recurrence]);
        if (statusSequence.length !== requiredCount) {
          throw new Error(
            `For ${recurrence.toLowerCase()} recurrence over ${daysDiff} days, ` +
            `you need exactly ${requiredCount} statuses separated by *. ` +
            `Or remove the asterisks to use the same status for all updates.`
          );
        }
      }

      // Prepare statuses array
      const statuses = [];

      let sequenceIndex = 0;
      let currentDate = startDt;
      const days_width = isRecurring ? recurrenceDaysMap[recurrence] : 1;

      // Create status for each day
      while (currentDate <= finalEndDt) {
        const scheduledDateUtc = currentDate.toUTC().toJSDate();
        const daysLeft = Math.ceil((finalEndDt.toJSDate().getTime() - currentDate.toJSDate().getTime()) / (1000 * 60 * 60 * 24));

        // Build status content
        let statusContent = '';
        if (!input.isFreeForm) {
          if (title?.trim()) {
            statusContent += `Status: ${title}\n`;
          }
          statusContent += `Campaign Start Date: ${startDate}\n`;
          statusContent += `Campaign End Date: ${endDate}\n`;
          statusContent += `Days Remaining: ${daysLeft}\n\n`;
        }

        // Select appropriate status from sequence
        const selectedStatus = isRecurring && statusSequence.length > 0
          ? statusSequence[sequenceIndex % statusSequence.length]
          : statusText;
        statusContent += selectedStatus?.replace(/{days_left}/g, daysLeft.toString());

        // Add media metadata
        const mediaMetadata = media && media.length > 0 
          ? addMediaToItem({}, media, sequenceIndex)
          : addMediaToItem({});

        statuses.push({
          sessionId,
          content: statusContent,
          scheduledAt: scheduledDateUtc,
          ...mediaMetadata
        });

        currentDate = currentDate.plus({ days: days_width });
        sequenceIndex++;
      }

      // Create the status campaign with statuses
      const statusCampaign = await ctx.db.statusCampaign.create({
        data: {
          sessionId,
          title,
          startDate: startDt.toJSDate(),
          endDate: finalEndDt.toJSDate(),
          sendTimeUtc: startDt.toUTC().toJSDate(),
          timeZone,
          template: statusText,
          status: "SCHEDULED",
          isRecurring,
          recurrence,
          isFreeForm: input.isFreeForm,
          statuses: {
            create: statuses,
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

  // Add other methods like updateCampaign, updateStatus, etc.
});
