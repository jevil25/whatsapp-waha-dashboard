export interface MonthlyBreakdown {
  month: number;
  year: number;
  groupsConnected: number;
  messagesScheduled: number;
}

export interface UserActivity {
  userId: string;
  userName: string;
  email: string;
  totalGroups: number;
  totalMessages: number;
  monthlyBreakdown: MonthlyBreakdown[];
}

export type UserActivityReport = UserActivity[];
