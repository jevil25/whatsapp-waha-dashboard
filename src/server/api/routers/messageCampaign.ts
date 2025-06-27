import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const messageCampaignRouter = createTRPCRouter({
  createCampaign: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        sessionId: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        messageTime: z.string().regex(/^\d{1,2}:\d{2}$/),
        messageTemplate: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { groupId, sessionId, startDate, endDate, messageTime, messageTemplate } = input;

      const startDateTime = new Date(startDate);
      const endDateTime = new Date(endDate);
      const [hours, minutes] = messageTime.split(':').map(Number);

      const sendTimeUtc = new Date();
      if (typeof hours === "number" && !isNaN(hours)) {
        sendTimeUtc.setUTCHours(hours - 5);
      } else {
        throw new Error("Invalid hours value in messageTime");
      }
      if (typeof minutes === "number" && !isNaN(minutes)) {
        sendTimeUtc.setUTCMinutes(minutes);
      } else {
        throw new Error("Invalid minutes value in messageTime");
      }
      sendTimeUtc.setUTCSeconds(0);
      sendTimeUtc.setUTCMilliseconds(0);


      const daysDiff = Math.ceil(
        (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60 * 24)
      );

      const messages = [];
      for (let i = 0; i <= daysDiff; i++) {
        const scheduledDate = new Date(startDateTime);
        scheduledDate.setDate(startDateTime.getDate() + i);
        scheduledDate.setHours(hours);
        scheduledDate.setMinutes(minutes);
        scheduledDate.setSeconds(0);
        scheduledDate.setMilliseconds(0);

        // Calculate days left for this message
        const daysLeft = daysDiff - i;
        const messageContent = messageTemplate.replace(/{days_left}/g, daysLeft.toString());

        messages.push({
          sessionId,
          content: messageContent,
          scheduledAt: scheduledDate,
        });
      }

      const campaign = await ctx.db.messageCampaign.create({
        data: {
          groupId,
          sessionId,
          startDate: startDateTime,
          endDate: endDateTime,
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
});
