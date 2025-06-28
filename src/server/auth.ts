import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";
import { sendResetPasswordEmail } from "./mailgun";

const prisma = new PrismaClient();

export const auth = betterAuth({
    emailAndPassword: {  
        enabled: true,
        requireEmailVerification: false,
        sendResetPassword: async ({user, url, token}) => {
            await sendResetPasswordEmail(user.email, url, token);
        },
    },
    database: prismaAdapter(prisma, {
        provider: "mongodb",
    }),
    user: {
        additionalFields: {
            role: {
                type: "string",
                required: false,
                defaultValue: "GUEST",
                input: false,
                output: true,
                fieldName: "role",
                references: {
                    model: "User",
                    field: "role",
                },
            },
        },
    }
});
