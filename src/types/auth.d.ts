import 'better-auth/react';

declare module 'better-auth/react' {
  export interface User {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    role?: 'ADMIN' | 'USER' | 'GUEST';
    createdAt: Date;
    updatedAt: Date;
    image?: string | null;
  }
}
