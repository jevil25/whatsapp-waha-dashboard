/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
'use client';

import { useState } from 'react';
import { authClient } from "~/client/auth";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { type PendingUser } from "~/types/admin";

export default function AdminDashboard() {
  const { data: session, isPending: isSessionLoading } = authClient.useSession();
  const router = useRouter();
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');

  const { data: pendingUsers, isLoading: isPendingUsersLoading } = api.admin.getPendingUsers.useQuery(undefined, {
    enabled: !!session?.user && session.user.role === 'ADMIN',
  });

  const { mutate: approveUser, isPending: isApprovingUser } = api.admin.approveUser.useMutation({
    onSuccess: () => {
      api.admin.getPendingUsers.useQuery(undefined, {
        enabled: !!session?.user && session.user.role === 'ADMIN',
        refetchOnWindowFocus: false,
      });
    },
  });

  const { mutate: addNewUser, isPending: isAddingUser } = api.admin.addNewUser.useMutation({      onSuccess: () => {
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
    },
    onError: (error) => {
      alert(error.message);
    },
  });

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/auth");
        },
      },
    });
  };

  if (isSessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-pulse flex space-x-2">
          <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
          <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
          <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
        </div>
      </div>
    );
  }

  if (!session?.user || session.user.role !== 'ADMIN') {
    router.push("/");
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f0f2f5]">
      <div className="bg-[#008069] text-white px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-sm bg-[#ffffff1a] px-3 py-1.5 rounded-md hover:bg-[#ffffff33] transition-colors"
          >
            Back
          </button>
          <h1 className="text-xl font-medium">Admin Dashboard</h1>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm bg-[#ffffff1a] px-3 py-1.5 rounded-md hover:bg-[#ffffff33] transition-colors"
        >
          Sign out
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-medium mb-4">Pending Users</h2>
            <div className="space-y-4">
              {isPendingUsersLoading ? (
                <div className="animate-pulse space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-[#f0f2f5] p-4 rounded-lg flex items-center justify-between">
                      <div className="w-2/3">
                        <div className="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                      </div>
                      <div className="w-20 h-8 bg-gray-300 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : pendingUsers && pendingUsers.length > 0 ? (
                pendingUsers.map((user: PendingUser) => (
                  <div key={user.id} className="bg-[#f0f2f5] p-4 rounded-lg flex items-center justify-between">
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                    <button
                      onClick={() => approveUser({ userId: user.id })}
                      disabled={isApprovingUser}
                      className="text-sm bg-[#008069] text-white px-3 py-1.5 rounded-md hover:bg-[#006d5a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isApprovingUser ? 'Approving...' : 'Approve'}
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">No pending users</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-medium mb-4">Add New User</h2>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (newUserName && newUserEmail && newUserPassword) {
                  addNewUser({ 
                    name: newUserName, 
                    email: newUserEmail,
                    password: newUserPassword
                  });
                }
              }} 
              className="space-y-4"
            >
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069] focus:border-transparent"
                  placeholder="Enter name"
                  required
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069] focus:border-transparent"
                  placeholder="Enter email"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069] focus:border-transparent"
                  placeholder="Enter password"
                  required
                  minLength={8}
                />
              </div>
              <button
                type="submit"
                disabled={isAddingUser}
                className="w-full bg-[#008069] text-white px-4 py-2 rounded-md hover:bg-[#006d5a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAddingUser ? 'Adding User...' : 'Add User'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
