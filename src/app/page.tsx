'use client';

import { authClient } from "~/client/auth";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { type WhatsAppSessionWithGroups } from "~/types/whatsapp";

export default function Home() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  const { data: whatsAppSession, isLoading: isWhatsAppLoading } = api.user.getWhatsAppSession.useQuery(undefined, {
    enabled: !!session?.user && session.user.role !== 'GUEST',
  }) as { data: WhatsAppSessionWithGroups | null | undefined, isLoading: boolean };

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/auth");
        },
      },
    });
  };

  if (isPending) {
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

  if (!session?.user) {
    router.push("/auth");
    return null;
  }

  const isGuestUser = session.user.role === 'GUEST';
  const isAdminUser = session.user.role === 'ADMIN';

  if (isGuestUser) {
    return (
      <main className="min-h-screen bg-[#f0f2f5]">
        {/* WhatsApp-style header */}
        <div className="bg-[#008069] text-white px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-medium">WhatsApp Group Manager</h1>
          <button
            onClick={handleSignOut}
            className="text-sm bg-[#ffffff1a] px-3 py-1.5 rounded-md hover:bg-[#ffffff33] transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Guest message in WhatsApp chat style */}
        <div className="max-w-2xl mx-auto p-4 pt-8">
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <div className="flex items-center mb-3">
              <div className="w-12 h-12 bg-[#008069] rounded-full flex items-center justify-center">
                <span className="text-white text-xl">👋</span>
              </div>
              <div className="ml-4">
                <h2 className="font-medium">{session.user.name}</h2>
                <p className="text-sm text-gray-500">{session.user.email}</p>
              </div>
            </div>
            <div className="bg-[#fff3cd] text-[#856404] p-4 rounded-lg border-l-4 border-[#ffeeba] mt-4">
              <p className="mb-2 font-medium">Waiting for Admin Approval</p>
              <p className="text-sm">Your account is currently pending approval from an administrator. You&apos;ll be notified once your account is approved.</p>
            </div>
          </div>

          {/* WhatsApp-style timestamp */}
          <div className="text-center">
            <span className="inline-block bg-[#e1f2fa] text-[#5b7083] text-xs px-2 py-1 rounded">
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}
            </span>
          </div>
        </div>
      </main>
    );
  }

  // Regular user view with WhatsApp style
  return (
    <main className="min-h-screen bg-[#f0f2f5]">
      <div className="bg-[#008069] text-white px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-medium">WhatsApp Group Manager</h1>
        <div className="flex items-center gap-3">
          {isAdminUser && (
            <button
              onClick={() => router.push('/admin')}
              className="text-sm bg-[#ffffff1a] px-3 py-1.5 rounded-md hover:bg-[#ffffff33] transition-colors"
            >
              Admin Dashboard
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="text-sm bg-[#ffffff1a] px-3 py-1.5 rounded-md hover:bg-[#ffffff33] transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-[#008069] rounded-full flex items-center justify-center">
                <span className="text-white text-xl">
                  {session.user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="ml-4">
                <h2 className="text-xl font-medium">{session.user.name}</h2>
                <p className="text-gray-500">{session.user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Active</span>
              {session.user.role === 'ADMIN' && (
                <span className="text-xs bg-[#008069] text-white px-2 py-0.5 rounded">Admin</span>
              )}
            </div>
          </div>

          {isWhatsAppLoading ? (
            <div className="space-y-4">
              <div className="animate-pulse space-y-4">
                <div className="h-32 bg-gray-100 rounded-lg"></div>
              </div>
            </div>
          ) : whatsAppSession ? (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-lg divide-y">
                <div className="p-4">
                  <h3 className="text-lg font-medium mb-2">WhatsApp Session</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{whatsAppSession.sessionName}</p>
                      <p className="text-sm text-gray-500">{whatsAppSession.phoneNumber}</p>
                    </div>
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Connected</span>
                  </div>
                </div>

                <div className="p-4">
                  <h3 className="text-lg font-medium mb-2">Connected Groups</h3>
                  {whatsAppSession.WhatsAppGroups.length > 0 ? (
                    <div className="space-y-2">
                      {whatsAppSession.WhatsAppGroups.map(group => (
                        <div key={group.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                          <div>
                            <p className="font-medium">{group.groupName}</p>
                            <p className="text-xs text-gray-500">{group.campaigns.length} active campaigns</p>
                          </div>
                          {group.campaigns.length > 0 && (
                            <div className="space-x-1">
                              {group.campaigns.map(campaign => (
                                <span 
                                  key={campaign.id}
                                  className={`text-xs px-2 py-0.5 rounded ${
                                    campaign.status === 'IN_PROGRESS' 
                                      ? 'bg-blue-100 text-blue-800' 
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}
                                >
                                  {campaign.status}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No groups connected yet</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#fff3cd] text-[#856404] p-4 rounded-lg border-l-4 border-[#ffeeba]">
              <p className="font-medium mb-2">No WhatsApp Session Connected</p>
              <p className="text-sm">Connect your WhatsApp account to start managing your groups.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
