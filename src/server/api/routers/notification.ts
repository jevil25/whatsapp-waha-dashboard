import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { notifyAdminOfNewRegistration } from "~/server/mailgun";

export const notificationRouter = createTRPCRouter({
  notifyAdminOfUserRegistration: publicProcedure
    .input(z.object({
      userName: z.string(),
      userEmail: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await notifyAdminOfNewRegistration(input.userName, input.userEmail);
        return {
          success: true,
          whatsappSent: result.whatsapp,
          emailSent: result.email,
          errors: result.errors,
        };
      } catch (error) {
        console.error("Failed to notify admin of user registration:", error);
        return {
          success: false,
          whatsappSent: false,
          emailSent: false,
          errors: [error instanceof Error ? error.message : "Unknown error"],
        };
      }
    }),
});
