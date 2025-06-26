export interface PendingUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
}

export interface NewUser {
  name: string;
  email: string;
}
