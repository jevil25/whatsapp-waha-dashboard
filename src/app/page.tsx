'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { authClient } from "~/client/auth";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { type WhatsAppSessionStatus } from "~/types/session";
import { GroupSelector } from './_components/whatsapp/GroupSelector';

export default function Home() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  const [isConnecting, setIsConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<WhatsAppSessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSessionName, setCurrentSessionName] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const { data: whatsAppSession, isLoading: isWhatsAppLoading } = api.user.getWhatsAppSession.useQuery(undefined, {
    enabled: !!session?.user && session.user.role !== 'GUEST',
    staleTime: Infinity,
  });

  const trpcUtils = api.useUtils();
  
  const initSession = api.user.initiateWhatsAppSession.useMutation({
    onSuccess: ({ sessionName }) => {
      setIsConnecting(true);
      setCurrentSessionName(sessionName);
      void pollSessionStatus(sessionName);
    },
    onError: (error) => {
      setError(error.message);
      setCurrentSessionName(null);
    },
  });

  const restartSession = api.user.restartSession.useMutation({
    onSuccess: (_, { sessionName }) => {
      setSessionStatus('STARTING');
      void pollSessionStatus(sessionName);
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  const logoutSession = api.user.logoutSession.useMutation({
    onSuccess: () => {
      setQrCode(null);
      setSessionStatus(null);
      setCurrentSessionName(null);
      void trpcUtils.user.getWhatsAppSession.invalidate();
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  const [screenshotKey, setScreenshotKey] = useState(0);

  const pollSessionStatus = useCallback(async (sessionName: string) => {
    try {
      const statusResult = await trpcUtils.user.getSessionStatus.fetch({ sessionName });
      setSessionStatus(statusResult.status);

      switch (statusResult.status) {
        case 'STARTING':
          // Poll again in 2 seconds if still starting
          return 2000;

        case 'SCAN_QR_CODE':
          const qrResult = await trpcUtils.user.getSessionQR.fetch({ sessionName });
          setQrCode(qrResult.qr);
          setScreenshotKey(prev => prev + 1);
          return 5000;

        case 'WORKING':
          setQrCode(null);
          setIsConnecting(false);
          void trpcUtils.user.getWhatsAppSession.invalidate();
          return null;

        case 'STOPPED':
        case 'FAILED':
          setQrCode(null);
          return null;

        default:
          // For any other status, stop polling
          return null;
      }
    } catch {
      setError('Failed to check session status');
      setIsConnecting(false);
      return null;
    }
  }, [trpcUtils.user.getSessionStatus, trpcUtils.user.getSessionQR, trpcUtils.user.getWhatsAppSession]);

  const handleConnect = () => {
    setError(null);
    void initSession.mutate();
  };

  const handleRestart = (sessionName: string) => {
    setError(null);
    void restartSession.mutate({ sessionName });
  };

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/auth");
        },
      },
    });
  };

  // Add useEffect to start polling for existing sessions
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;
    
    const poll = async () => {
      if (!whatsAppSession?.sessionName || isConnecting) return;
      
      const interval = await pollSessionStatus(whatsAppSession.sessionName);
      
      if (interval) {
        timeoutId = setTimeout(() => void poll(), interval);
      }
    };

    void poll();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [whatsAppSession?.sessionName, isConnecting, pollSessionStatus]);

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
          {session.user.role === 'ADMIN' && (
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
                    {(() => {
                      if (typeof whatsAppSession.sessionName !== 'string') return null;

                      switch (sessionStatus) {
                        case 'WORKING':
                          return (
                            <div className="flex items-center gap-4">
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Connected</span>
                              <button
                                onClick={() => logoutSession.mutate({ sessionName: whatsAppSession.sessionName })}
                                className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded hover:bg-red-200"
                                disabled={logoutSession.isPending}
                              >
                                {logoutSession.isPending ? 'Disconnecting...' : 'Disconnect'}
                              </button>
                            </div>
                          );
                        case 'STOPPED':
                        case 'FAILED':
                          return (
                            <button
                              onClick={() => handleRestart(whatsAppSession.sessionName)}
                              className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded hover:bg-yellow-200"
                            >
                              {restartSession.isPending ? 'Restarting...' : 'Click to Restart'}
                            </button>
                          );
                        case 'STARTING':
                          return <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Starting...</span>;
                        case 'SCAN_QR_CODE':
                          return <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Waiting for QR Scan</span>;
                        default:
                          return null;
                      }
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-[#fff3cd] text-[#856404] p-4 rounded-lg border-l-4 border-[#ffeeba]">
                <p className="font-medium mb-2">No WhatsApp Session Connected</p>
                <p className="text-sm">Connect your WhatsApp account to start managing your groups.</p>
              </div>
              <h3 className="text-lg font-medium mb-4">
                  Connect WhatsApp
                  <span className="text-xs ml-2 bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    Status: {sessionStatus ?? 'Not Connected'}
                  </span>
                </h3>
                
                {error ? (
                  <div className="bg-red-100 text-red-800 p-4 rounded-lg mb-4">
                    <p>{error}</p>
                  </div>
                ) : null}

                  {!isConnecting && (
                    <button
                      onClick={handleConnect}
                      className="w-full bg-[#008069] text-white px-4 py-2 rounded-lg hover:bg-[#006d5b] transition-colors"
                      disabled={initSession.isPending}
                    >
                      {initSession.isPending ? 'Initializing...' : 'Connect WhatsApp'}
                    </button>
                  )}
            </div>
          )}
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-lg border border-gray-200">
                    {sessionStatus === 'STARTING' && (
                      <div className="flex items-center justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#008069]"></div>
                        <span className="ml-3 text-sm text-gray-600">
                          Starting WhatsApp session...
                        </span>
                      </div>
                    )}

                    {sessionStatus === 'SCAN_QR_CODE' && (
                      <div className="space-y-4 mt-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="font-medium mb-2">Scan QR Code</h4>
                          <ol className="list-decimal list-inside text-sm space-y-1 text-gray-600 mb-4">
                            <li>Open WhatsApp on your phone</li>
                            <li>Tap Menu (⋮) or Settings</li>
                            <li>Select Linked Devices</li>
                            <li>Tap on &quot;Link a Device&quot;</li>
                            <li>Point your phone to this screen to scan the code</li>
                          </ol>
                          <div className="flex flex-col md:flex-row gap-4 items-center justify-center">
                            <div className="relative w-64 h-64 bg-white border-2 border-gray-300 rounded-lg p-4">
                              {qrCode ? (
                                <Image 
                                  src={`data:image/png;base64,${qrCode}`} 
                                  alt="WhatsApp QR Code"
                                  fill
                                  priority
                                  style={{ objectFit: 'contain' }}
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full">
                                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#008069]" />
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-center">
                              <div className="relative w-80 h-56 bg-white border-2 border-gray-300 rounded-lg p-4">
                                {whatsAppSession?.sessionName ? (
                                  <Image 
                                    key={screenshotKey}
                                    src={`/api/screenshot?session=${whatsAppSession.sessionName}&_=${screenshotKey}`}
                                    alt="WhatsApp Screenshot"
                                    fill
                                    priority
                                    style={{ objectFit: 'contain' }}
                                    className="rounded-lg"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center justify-center h-full">
                                    <p className="text-sm text-gray-500">Waiting for session...</p>
                                  </div>
                                )}
                              </div>
                              <p className="text-sm text-gray-500 mt-2">Live Preview</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {(sessionStatus === 'STOPPED' || sessionStatus === 'FAILED') && (
                      <div className="bg-yellow-100 text-yellow-800 p-4 rounded-lg">
                        <p className="font-medium mb-2">Session {sessionStatus === 'STOPPED' ? 'Stopped' : 'Failed'}</p>
                        <p className="text-sm mb-4">
                          {sessionStatus === 'STOPPED'
                            ? 'The WhatsApp session is currently stopped.'
                            : 'There was an error with the WhatsApp session.'}
                        </p>
                        {currentSessionName && (
                          <button
                            onClick={() => handleRestart(currentSessionName)}
                            className="bg-yellow-200 text-yellow-800 px-4 py-2 rounded hover:bg-yellow-300 transition-colors"
                            disabled={restartSession.isPending}
                          >
                            {restartSession.isPending ? 'Restarting...' : 'Restart Session'}
                          </button>
                        )}
                      </div>
                    )}

                    {sessionStatus === 'WORKING' && whatsAppSession?.sessionName && (
                      <div className="mt-8 border-t pt-6">
                        <h3 className="text-lg font-medium mb-4">WhatsApp Groups</h3>
                        <GroupSelector
                          sessionName={whatsAppSession.sessionName}
                          selectedGroupId={selectedGroupId}
                          onGroupSelect={setSelectedGroupId}
                        />
                      </div>
                    )}

                    <div className="text-center mt-4">
                      <span className="text-sm text-gray-500">
                        Status: {sessionStatus ?? 'Initializing...'}
                      </span>
                    </div>
                  </div>
                </div>
            </div>
          </div>
        </main>
)}
