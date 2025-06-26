/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
'use client';

import { useState } from 'react';
import { authClient } from "~/client/auth";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { type PendingUser } from "~/types/admin";
import ConfirmationModal from "~/app/_components/ConfirmationModal";

export default function AdminDashboard() {
  const { data: session, isPending: isSessionLoading } = authClient.useSession();
  const router = useRouter();
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [deletingUsers, setDeletingUsers] = useState<Set<string>>(new Set());
  const [makingAdminUsers, setMakingAdminUsers] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<{
    addUser?: string;
    revokeAccess?: string;
    deleteUser?: string;
    makeAdmin?: string;
  }>({});

  const { data: pendingUsers, isLoading: isPendingUsersLoading, refetch: refetchPendingUsers } = 
    api.admin.getPendingUsers.useQuery(undefined, {
      enabled: !!session?.user && session.user.role === 'ADMIN',
    });

  const { data: approvedUsers, isLoading: isApprovedUsersLoading, refetch: refetchApprovedUsers } = 
    api.admin.getApprovedUsers.useQuery(undefined, {
      enabled: !!session?.user && session.user.role === 'ADMIN',
    });

  const { data: whatsAppSessions, isLoading: isWhatsAppSessionsLoading } = api.admin.getWhatsAppSessions.useQuery(undefined, {
    enabled: !!session?.user && session.user.role === 'ADMIN',
  });

  const { data: whatsAppGroups, isLoading: isWhatsAppGroupsLoading } = api.admin.getWhatsAppGroups.useQuery(undefined, {
    enabled: !!session?.user && session.user.role === 'ADMIN',
  });

  const { data: activeCampaigns, isLoading: isActiveCampaignsLoading } = api.admin.getActiveCampaigns.useQuery(undefined, {
    enabled: !!session?.user && session.user.role === 'ADMIN',
  });

  const [approvingUsers, setApprovingUsers] = useState<Set<string>>(new Set());
  
  const { mutate: approveUser } = api.admin.approveUser.useMutation({
    onSuccess: (_, variables) => {
      void refetchPendingUsers();
      void refetchApprovedUsers();
      setApprovingUsers(prev => {
        const next = new Set(prev);
        next.delete(variables.userId);
        return next;
      });
    },
  });

  const [revokingUsers, setRevokingUsers] = useState<Set<string>>(new Set());
  
  const { mutate: revokeAccess } = api.admin.revokeAccess.useMutation({
    onSuccess: (_, variables) => {
      void refetchPendingUsers();
      void refetchApprovedUsers();
      setRevokingUsers(prev => {
        const next = new Set(prev);
        next.delete(variables.userId);
        return next;
      });
      setErrors(prev => ({ ...prev, revokeAccess: undefined }));
    },
    onError: (error) => {
      setErrors(prev => ({ ...prev, revokeAccess: error.message }));
    },
  });

  const { mutate: deleteUser } = api.admin.deleteUser.useMutation({
    onSuccess: () => {
      void refetchPendingUsers();
      void refetchApprovedUsers();
      setUserToDelete(null);
      setDeletingUsers(prev => {
        const next = new Set(prev);
        if (userToDelete) next.delete(userToDelete);
        return next;
      });
      setErrors(prev => ({ ...prev, deleteUser: undefined }));
    },
    onError: (error) => {
      if (userToDelete) {
        setDeletingUsers(prev => {
          const next = new Set(prev);
          next.delete(userToDelete);
          return next;
        });
      }
      setErrors(prev => ({ ...prev, deleteUser: error.message }));
    },
  });

  const { mutate: makeAdmin } = api.admin.makeAdmin.useMutation({
    onSuccess: (_, variables) => {
      void refetchApprovedUsers();
      setMakingAdminUsers(prev => {
        const next = new Set(prev);
        next.delete(variables.userId);
        return next;
      });
      setErrors(prev => ({ ...prev, makeAdmin: undefined }));
    },
    onError: (error, variables) => {
      setMakingAdminUsers(prev => {
        const next = new Set(prev);
        next.delete(variables.userId);
        return next;
      });
      setErrors(prev => ({ ...prev, makeAdmin: error.message }));
    },
  });

  const { mutate: addNewUser, isPending: isAddingUser } = api.admin.addNewUser.useMutation({
    onSuccess: () => {
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      void refetchPendingUsers();
      void refetchApprovedUsers();
      setErrors(prev => ({ ...prev, addUser: undefined }));
    },
    onError: (error) => {
      setErrors(prev => ({ ...prev, addUser: error.message }));
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
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setUserToDelete(null);
        }}
        onConfirm={() => {
          if (userToDelete) {
            deleteUser({ userId: userToDelete });
          }
          setDeleteModalOpen(false);
        }}
        title="Delete User"
        message="Are you sure you want to delete this user? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />

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

      <div className="max-w-6xl mx-auto p-4">
        <div className="space-y-6">
          {/* WhatsApp Integration Section */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-medium mb-4">WhatsApp Integration</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#f0f2f5] p-4 rounded-lg">
                <h3 className="text-lg font-medium mb-2">Active Sessions</h3>
                {isWhatsAppSessionsLoading ? (
                  <div className="animate-pulse space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="bg-white p-3 rounded">
                        <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-4 bg-gray-100 rounded w-1/2 mb-2"></div>
                        <div className="h-3 bg-gray-100 rounded w-1/4"></div>
                      </div>
                    ))}
                  </div>
                ) : whatsAppSessions?.length ? (
                  <div className="space-y-2">
                    {whatsAppSessions.map((session) => (
                      <div key={session.id} className="bg-white p-3 rounded">
                        <p className="font-medium">{session.sessionName}</p>
                        <p className="text-sm text-gray-500">{session.phoneNumber}</p>
                        <p className="text-xs text-gray-400">{session.WhatsAppGroups.length} groups</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white p-4 rounded text-center">
                    <p className="text-sm text-gray-500 mb-2">No active sessions</p>
                    <p className="text-xs text-gray-400">Add a WhatsApp session to get started</p>
                  </div>
                )}
              </div>

              <div className="bg-[#f0f2f5] p-4 rounded-lg">
                <h3 className="text-lg font-medium mb-2">Connected Groups</h3>
                {isWhatsAppGroupsLoading ? (
                  <div className="animate-pulse space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="bg-white p-3 rounded">
                        <div className="h-5 bg-gray-200 rounded w-2/3 mb-2"></div>
                        <div className="h-3 bg-gray-100 rounded w-1/3"></div>
                      </div>
                    ))}
                  </div>
                ) : whatsAppGroups?.length ? (
                  <div className="space-y-2">
                    {whatsAppGroups.map((group) => (
                      <div key={group.id} className="bg-white p-3 rounded">
                        <p className="font-medium">{group.groupName}</p>
                        <p className="text-xs text-gray-400">{group.campaigns.length} active campaigns</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white p-4 rounded text-center">
                    <p className="text-sm text-gray-500 mb-2">No connected groups</p>
                    <p className="text-xs text-gray-400">Connect to a WhatsApp group to begin</p>
                  </div>
                )}
              </div>

              <div className="bg-[#f0f2f5] p-4 rounded-lg">
                <h3 className="text-lg font-medium mb-2">Active Campaigns</h3>
                {isActiveCampaignsLoading ? (
                  <div className="animate-pulse space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="bg-white p-3 rounded">
                        <div className="flex items-center justify-between mb-2">
                          <div className="h-5 bg-gray-200 rounded w-1/2"></div>
                          <div className="h-4 bg-gray-100 rounded w-16"></div>
                        </div>
                        <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                      </div>
                    ))}
                  </div>
                ) : activeCampaigns?.length ? (
                  <div className="space-y-2">
                    {activeCampaigns.map((campaign) => (
                      <div key={campaign.id} className="bg-white p-3 rounded">
                        <div className="flex items-center justify-between">
                          <p className="font-medium truncate">{campaign.group.groupName}</p>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            campaign.status === 'IN_PROGRESS' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {campaign.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">
                          Starts: {new Date(campaign.startDate).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white p-4 rounded text-center">
                    <p className="text-sm text-gray-500 mb-2">No active campaigns</p>
                    <p className="text-xs text-gray-400">Create a campaign to start messaging</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* User Management Sections - updated to be more compact */}
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
                        onClick={() => {
                          setApprovingUsers(prev => new Set(prev).add(user.id));
                          approveUser({ userId: user.id });
                        }}
                        disabled={approvingUsers.has(user.id)}
                        className="text-sm bg-[#008069] text-white px-3 py-1.5 rounded-md hover:bg-[#006d5a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {approvingUsers.has(user.id) ? 'Approving...' : 'Approve'}
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
                {errors.addUser && (
                  <div className="text-sm text-red-600">{errors.addUser}</div>
                )}
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

          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-medium mb-4">Approved Users</h2>
            {(errors.makeAdmin ?? errors.revokeAccess ?? errors.deleteUser) && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                {errors.makeAdmin && <p className="text-sm text-red-600">{errors.makeAdmin}</p>}
                {errors.revokeAccess && <p className="text-sm text-red-600">{errors.revokeAccess}</p>}
                {errors.deleteUser && <p className="text-sm text-red-600">{errors.deleteUser}</p>}
              </div>
            )}
            <div className="space-y-2">
              {isApprovedUsersLoading ? (
                <div className="animate-pulse space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-[#f0f2f5] p-3 rounded-lg">
                      <div className="w-2/3">
                        <div className="h-4 bg-gray-300 rounded w-1/2 mb-1"></div>
                        <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : approvedUsers && approvedUsers.length > 0 ? (
                approvedUsers.map((user) => (
                  <div key={user.id} className="bg-[#f0f2f5] p-3 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                        {user.role === 'ADMIN' && (
                          <span className="text-xs bg-[#008069] text-white px-2 py-0.5 rounded">Admin</span>
                        )}
                      </div>
                      {user.role !== 'ADMIN' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setMakingAdminUsers(prev => new Set(prev).add(user.id));
                              makeAdmin({ userId: user.id });
                            }}
                            disabled={makingAdminUsers.has(user.id)}
                            className="text-xs bg-[#008069] text-white px-2 py-1 rounded hover:bg-[#006d5a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {makingAdminUsers.has(user.id) ? '...' : 'Admin'}
                          </button>
                          <button
                            onClick={() => {
                              setRevokingUsers(prev => new Set(prev).add(user.id));
                              revokeAccess({ userId: user.id });
                            }}
                            disabled={revokingUsers.has(user.id)}
                            className="text-xs bg-[#ffa500] text-white px-2 py-1 rounded hover:bg-[#ff8c00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {revokingUsers.has(user.id) ? '...' : 'Revoke'}
                          </button>
                          <button
                            onClick={() => {
                              setUserToDelete(user.id);
                              setDeleteModalOpen(true);
                            }}
                            disabled={deletingUsers.has(user.id)}
                            className="text-xs bg-[#dc3545] text-white px-2 py-1 rounded hover:bg-[#c82333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {deletingUsers.has(user.id) ? '...' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">No approved users</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
