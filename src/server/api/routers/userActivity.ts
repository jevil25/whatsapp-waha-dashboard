import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import type { UserActivity, MonthlyBreakdown } from "~/types/userActivity";
import type { Prisma } from "@prisma/client";
import { sendUserSummaryEmail } from "~/server/mailgun";

export const userActivityRouter = createTRPCRouter({
  getUserActivityReport: adminProcedure
    .input(
      z.object({
        startMonth: z.number().optional(),
        startYear: z.number().optional(),
        endMonth: z.number().optional(),
        endYear: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }): Promise<UserActivity[]> => {
      const { startMonth, startYear, endMonth, endYear } = input;

      // Get all non-admin users
      const users = await ctx.db.user.findMany({
        where: {
          role: { not: 'ADMIN' },
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });

      // For each user, get their activity data
      const activityData = await Promise.all(
        users.map(user => getUserActivitySummary(ctx, user.id, startMonth, startYear, endMonth, endYear))
      );

      return activityData;
    }),
  sendActivityReport: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        month: z.number().optional(),
        year: z.number(),
        startMonth: z.number().optional(),
        startYear: z.number().optional(),
        endMonth: z.number().optional(),
        endYear: z.number().optional(),
        summary: z.any().optional(), // Pass summary data from frontend if needed
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, month, year, startMonth, startYear, endMonth, endYear, summary } = input;

      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          name: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get the user's activity summary for the selected range
      // You can reuse the same logic as in getUserActivityReport for a single user
      // Or use the summary passed from frontend
      let userSummary = summary;
      if (!userSummary) {
        userSummary = await getUserActivitySummary(ctx, userId, startMonth, startYear, endMonth, endYear);
      }

      // Generate email content
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const rangeText = startMonth && startYear && endMonth && endYear
        ? `${monthNames[startMonth-1]} ${startYear} - ${monthNames[endMonth-1]} ${endYear}`
        : month && year
        ? `${monthNames[month-1]} ${year}`
        : year
        ? `${year}`
        : '';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background:#f8f9fa; padding:24px; border-radius:8px;">
          <h2 style="color:#25D366;">📊 TrueSenger - Activity Summary</h2>
          <p>Hi <strong>${user.name}</strong>,</p>
          <p>Here is your activity summary for <strong>${rangeText}</strong>:</p>
          <ul style="background:#fff; padding:16px; border-radius:8px;">
            <li><strong>Total Groups Connected:</strong> ${userSummary?.totalGroups ?? 'N/A'}</li>
            <li><strong>Total Messages Scheduled:</strong> ${userSummary?.totalMessages ?? 'N/A'}</li>
          </ul>
          <h3 style="margin-top:24px;">Monthly Breakdown</h3>
          <table style="width:100%; border-collapse:collapse; background:#fff; border-radius:8px;">
            <thead>
              <tr style="background:#e8f4fd;">
                <th style="padding:8px; text-align:left;">Month</th>
                <th style="padding:8px; text-align:left;">Groups</th>
                <th style="padding:8px; text-align:left;">Messages</th>
              </tr>
            </thead>
            <tbody>
              ${userSummary?.monthlyBreakdown?.map((m:any) => `
                <tr>
                  <td style="padding:8px;">${monthNames[m.month-1]} ${m.year}</td>
                  <td style="padding:8px;">${m.groupsConnected}</td>
                  <td style="padding:8px;">${m.messagesScheduled}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <p style="margin-top:24px; color:#666; font-size:14px;">Thank you for using TrueSenger!</p>
        </div>
      `;
      const text = `TrueSenger - Activity Summary\n\nHi ${user.name},\n\nHere is your activity summary for ${rangeText}:\n\nTotal Groups Connected: ${userSummary?.totalGroups ?? 'N/A'}\nTotal Messages Scheduled: ${userSummary?.totalMessages ?? 'N/A'}\n\nMonthly Breakdown:\n${userSummary?.monthlyBreakdown?.map((m:any) => `${monthNames[m.month-1]} ${m.year}: ${m.groupsConnected} groups, ${m.messagesScheduled} messages`).join('\n')}
\nThank you for using TrueSenger!`;

      // Send email using Mailgun
      await sendUserSummaryEmail(user.email, html, text);

      return { success: true };
    }),
});

// New helper function to get user activity summary
async function getUserActivitySummary(ctx: any, userId: string, startMonth?: number, startYear?: number, endMonth?: number, endYear?: number): Promise<UserActivity> {
  // Get user info
  const user = await ctx.db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
  });
  if (!user) throw new Error('User not found');

  // Build date filter for the selected range
  let dateFilter: Prisma.MessageCampaignWhereInput = {};
  if (startMonth && startYear && endMonth && endYear) {
    dateFilter = {
      createdAt: {
        gte: new Date(startYear, startMonth - 1, 1),
        lt: new Date(endYear, endMonth, 1),
      },
    };
  } else if (endMonth && endYear) {
    dateFilter = {
      createdAt: {
        gte: new Date(endYear, endMonth - 1, 1),
        lt: new Date(endYear, endMonth, 1),
      },
    };
  } else if (endYear) {
    dateFilter = {
      createdAt: {
        gte: new Date(endYear, 0, 1),
        lt: new Date(endYear + 1, 0, 1),
      },
    };
  }

  // Get campaigns for the selected period
  const campaigns = await ctx.db.messageCampaign.findMany({
    where: {
      session: {
        userId: userId,
      },
      ...dateFilter,
    },
    select: {
      id: true,
      createdAt: true,
      groupId: true,
      status: true,
    },
  });

  // Calculate totals for the selected period
  const uniqueGroups = new Set(campaigns.map((c: { groupId: string }) => c.groupId));

  // Calculate monthly breakdown
  const monthlyGroupsMap = new Map<string, Set<string>>();
  const monthlyMessagesMap = new Map<string, number>();

  campaigns.forEach((campaign: { createdAt: Date; groupId: string }) => {
    const campaignMonth = campaign.createdAt.getMonth() + 1;
    const campaignYear = campaign.createdAt.getFullYear();
    const key = `${campaignYear}-${campaignMonth}`;
    if (!monthlyGroupsMap.has(key)) {
      monthlyGroupsMap.set(key, new Set());
    }
    monthlyGroupsMap.get(key)!.add(campaign.groupId);
    monthlyMessagesMap.set(key, (monthlyMessagesMap.get(key) || 0) + 1);
  });

  const monthlyBreakdown: MonthlyBreakdown[] = Array.from(monthlyMessagesMap.entries())
    .map(([key, messagesScheduled]) => {
      const [yearStr, monthStr] = key.split('-');
      const groupsConnected = monthlyGroupsMap.get(key)?.size || 0;
      return {
        month: parseInt(monthStr as string, 10),
        year: parseInt(yearStr as string, 10),
        groupsConnected,
        messagesScheduled,
      };
    })
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

  return {
    userId: user.id,
    userName: user.name,
    email: user.email,
    totalGroups: uniqueGroups.size,
    totalMessages: campaigns.length,
    monthlyBreakdown,
  };
}
