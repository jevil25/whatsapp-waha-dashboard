import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const auth = betterAuth({
    emailAndPassword: {  
        enabled: true
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
