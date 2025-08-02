import { z } from "zod";

// Media input validation schema
export const mediaSchema = z.object({
  url: z.string(),
  publicId: z.string(),
  type: z.enum(['image', 'video']),
});

export type MediaInput = z.infer<typeof mediaSchema>;
