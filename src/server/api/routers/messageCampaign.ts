import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { DateTime } from "luxon";

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
      const messageContent = messageTemplate.replace(/{days_left}/g, daysLeft.toString());

      messages.push({
        sessionId,
        content: messageContent,
        scheduledAt: scheduledDateUtc,
      });
    }

    const campaign = await ctx.db.messageCampaign.create({
      data: {
        groupId,
        sessionId,
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
});
