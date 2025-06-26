import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    // No baseURL needed if API and frontend are on same domain
});
