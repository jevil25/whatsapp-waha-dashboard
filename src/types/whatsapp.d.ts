import { type WhatsAppSession } from "@prisma/client";

export interface WhatsAppSessionWithGroups extends WhatsAppSession {
  WhatsAppGroups: Array<{
    id: string;
    groupName: string;
    groupId: string;
    sessionId: string;
    createdAt: Date;
    updatedAt: Date;
    campaigns: Array<{
      id: string;
      status: 'SCHEDULED' | 'IN_PROGRESS';
      startDate: Date;
    }>;
  }>;
}
