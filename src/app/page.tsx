'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback, useRef } from 'react';
import { authClient } from "~/client/auth";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { type WhatsAppSessionStatus } from "~/types/session";
import { GroupSelector } from './_components/whatsapp/GroupSelector';
import { CampaignList } from './_components/whatsapp/CampaignList';
import { CompletedCampaignsModal } from './_components/whatsapp/CompletedCampaignsModal';

export default function Home() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  const [isCompletedCampaignsOpen, setIsCompletedCampaignsOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<WhatsAppSessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSessionName, setCurrentSessionName] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);
  const [screenshotKey, setScreenshotKey] = useState(0);

  // New state variables for scheduling
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [messageTime, setMessageTime] = useState('12:00');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [messagePreview, setMessagePreview] = useState('');

  const { data: whatsAppSession, isLoading: isWhatsAppLoading } = api.user.getWhatsAppSession.useQuery(undefined, {
    enabled: !!session?.user && session.user.role !== 'GUEST',
    staleTime: 5000,
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
    retry: 3,
    meta: {
      priority: 'high'
    }
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
      setSessionStatus(null);
      setCurrentSessionName(null);
      void trpcUtils.user.getWhatsAppSession.invalidate();
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  const pollIntervalRef = useRef<ReturnType<typeof setInterval>>(null);
  const sessionStatusRef = useRef<WhatsAppSessionStatus | null>(null);
  const currentSessionNameRef = useRef<string | null>(null);

  const pollSessionStatus = useCallback(async (sessionName: string) => {
    try {
      const statusResult = await trpcUtils.user.getSessionStatus.fetch({ sessionName });
      sessionStatusRef.current = statusResult.status;
      setSessionStatus(statusResult.status);

      if (statusResult.status === 'WORKING') {
        setIsConnecting(false);
      }
    } catch {
      setError('Failed to check session status');
      setIsConnecting(false);
    }
  }, [trpcUtils.user.getSessionStatus]);

  const startPolling = useCallback((sessionName: string) => {
    // Clear any existing polling interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    // Store the session name
    currentSessionNameRef.current = sessionName;
    setCurrentSessionName(sessionName);

    // Initial poll
    void pollSessionStatus(sessionName);

    // Start polling every 3 seconds
    pollIntervalRef.current = setInterval(() => {
      if (currentSessionNameRef.current) {
        void pollSessionStatus(currentSessionNameRef.current);
      }
    }, 3000);
  }, [pollSessionStatus]);

  // Start polling when component mounts or when session changes
  useEffect(() => {
    if (whatsAppSession?.sessionName) {
      startPolling(whatsAppSession.sessionName);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [whatsAppSession?.sessionName, startPolling]);

  // Prefetch groups when session becomes WORKING for highest priority
  useEffect(() => {
    if (sessionStatus === 'WORKING' && whatsAppSession?.sessionName) {
      // Prefetch the first page of groups immediately
      void trpcUtils.user.getWhatsAppGroups.prefetchInfinite({
        sessionName: whatsAppSession.sessionName,
        limit: 20,
        search: '',
      });
      
      // Immediately invalidate and refetch groups with highest priority
      void trpcUtils.user.getWhatsAppGroups.invalidate();
    }
  }, [sessionStatus, whatsAppSession?.sessionName, trpcUtils.user.getWhatsAppGroups]);

  const handleConnect = () => {
    setError(null);
    initSession.mutate(undefined, {
      onSuccess: ({ sessionName }) => {
        setIsConnecting(true);
        setCurrentSessionName(sessionName);
        startPolling(sessionName);
        void trpcUtils.user.getWhatsAppSession.invalidate();
      },
    });
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


  const handleRefreshScreen = () => {
    setScreenshotKey(prev => prev + 1);
  };

  useEffect(() => {
    if (sessionStatus === 'SCAN_QR_CODE') {
      const interval = setInterval(() => {
        setScreenshotKey(prev => prev + 1);
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [sessionStatus]);

  // Function to generate message preview
  const updateMessagePreview = useCallback(() => {
    if (!messageTemplate || !startDate || !endDate) {
      setMessagePreview('');
      return;
    }

    const endDateObj = new Date(endDate);
    const today = new Date();
    const daysLeft = Math.ceil((endDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    let preview = messageTemplate;
    // Replace dynamic placeholders
    preview = preview.replace(/{days_left}/g, daysLeft.toString());
    
    setMessagePreview(preview);
  }, [messageTemplate, startDate, endDate]);

  // Update preview when dependencies change
  useEffect(() => {
    updateMessagePreview();
  }, [messageTemplate, startDate, endDate, updateMessagePreview]);

  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const createCampaign = api.messageCampaign.createCampaign.useMutation({
    onSuccess: () => {
      setSubmitStatus({
        type: 'success',
        message: 'Message campaign created successfully!'
      });
      // Clear form
      setStartDate('');
      setEndDate('');
      setMessageTime('12:00');
      setMessageTemplate('');
      setMessagePreview('');
      // refetch campaigns
      void trpcUtils.messageCampaign.getCampaigns.invalidate();
    },
    onError: (error) => {
      setSubmitStatus({
        type: 'error',
        message: error.message || 'Failed to create message campaign'
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !whatsAppSession?.sessionName || !selectedGroupName) return;

    setSubmitStatus(null);
    createCampaign.mutate({
      groupId: selectedGroupId,
      groupName: selectedGroupName,
      sessionId: whatsAppSession.id,
      startDate,
      endDate,
      messageTime,
      messageTemplate,
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

  const handleGroupSelect = (groupId: string, groupName: string) => {
    setSelectedGroupId(groupId);
    setSelectedGroupName(groupName);
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
    <div>
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
              <div className="space-y-4 mt-6">
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
                            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                              <div className="flex">
                                <div className="flex-shrink-0">
                                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                  </svg>
                                </div>
                                <div className="ml-3">
                                  <p className="text-sm text-blue-700">
                                    After scanning, if you see the WhatsApp chat screen but the status doesn&apos;t show as &quot;Connected&quot;, please refresh the page.
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="relative w-[520px] h-[400px] bg-white border-2 border-gray-300 rounded-lg p-4">
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
                                    unoptimized={true}
                                  />
                                ) : (
                                  <div className="flex items-center justify-center h-full">
                                  <p className="text-sm text-gray-500">Waiting for session...</p>
                                  </div>
                                )}
                                </div>
                              <div className="mt-4 flex items-center justify-between w-full">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={handleRefreshScreen}
                                    className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Refresh Preview
                                  </button>
                                  <p className="text-sm text-gray-500">Auto-refreshes every 5s</p>
                                </div>
                                {whatsAppSession?.sessionName && (
                                  <button
                                    onClick={() => handleRestart(whatsAppSession.sessionName)}
                                    className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-md hover:bg-yellow-200 transition-colors flex items-center gap-2"
                                    disabled={restartSession.isPending}
                                  >
                                    {restartSession.isPending ? (
                                      <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        Restarting...
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        Restart Session
                                      </>
                                    )}
                                  </button>
                                )}
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
                        <div className="mt-6">
                          <div className="">
                                <div className="flex justify-between items-center mb-4">
                                  <h4 className="text-lg font-medium">Active Campaigns</h4>
                                  <button
                                    onClick={() => setIsCompletedCampaignsOpen(true)}
                                    className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                    View Completed Campaigns
                                  </button>
                                </div>
                                <CampaignList />
                          </div>
                          <h3 className="text-lg font-medium mb-4 mt-8">WhatsApp Groups</h3>
                          <GroupSelector
                            sessionName={whatsAppSession.sessionName}
                            selectedGroupId={selectedGroupId}
                            onGroupSelect={handleGroupSelect}
                          />
                          
                          {selectedGroupId && (
                            <div className="mt-6 border-t pt-6">
                              <h4 className="text-lg font-medium mb-4">Schedule Messages</h4>
                              
                              {submitStatus && (
                                <div className={`mb-4 p-4 rounded-lg ${
                                  submitStatus.type === 'success' 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {submitStatus.message}
                                </div>
                              )}
                              
                              <form className="space-y-4" onSubmit={handleSubmit}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                                      Start Date
                                    </label>
                                    <input
                                      type="date"
                                      id="startDate"
                                      value={startDate}
                                      onChange={(e) => setStartDate(e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069]"
                                      min={new Date().toISOString().split('T')[0]}
                                      required
                                    />
                                  </div>
                                  
                                  <div>
                                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                                      End Date
                                    </label>
                                    <input
                                      type="date"
                                      id="endDate"
                                      value={endDate}
                                      onChange={(e) => setEndDate(e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069]"
                                      min={startDate || new Date().toISOString().split('T')[0]}
                                      required
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label htmlFor="messageTime" className="block text-sm font-medium text-gray-700 mb-1">
                                    Time to Send (Central Time)
                                  </label>
                                  <input
                                    type="time"
                                    id="messageTime"
                                    value={messageTime}
                                    onChange={(e) => setMessageTime(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069]"
                                    required
                                  />
                                </div>

                                <div>
                                  <label htmlFor="messageTemplate" className="block text-sm font-medium text-gray-700 mb-1">
                                    Message Template
                                    <span className="text-xs text-gray-500 ml-2">
                                      Use {'{days_left}'} to show remaining days
                                    </span>
                                  </label>
                                  <textarea
                                    id="messageTemplate"
                                    value={messageTemplate}
                                    onChange={(e) => setMessageTemplate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069] min-h-[100px]"
                                    placeholder="Enter your message here. Use {days_left} to show the countdown."
                                    required
                                  />
                                </div>

                                {messageTemplate && messagePreview && (
                                  <div className="bg-gray-50 p-4 rounded-lg">
                                    <h5 className="text-sm font-medium text-gray-700 mb-2">Message Preview</h5>
                                    <div className="bg-white p-3 rounded border border-gray-200 whitespace-pre-wrap">
                                      {messagePreview}
                                    </div>
                                  </div>
                                )}

                                <button
                                  type="submit"
                                  className="w-full bg-[#008069] text-white px-4 py-2 rounded-lg hover:bg-[#006d5b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  disabled={createCampaign.isPending || !startDate || !endDate || !messageTemplate}
                                >
                                  {createCampaign.isPending ? 'Creating Campaign...' : 'Schedule Messages'}
                                </button>
                              </form>
                            </div>
                          )}
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
          <CompletedCampaignsModal
            isOpen={isCompletedCampaignsOpen}
            onClose={() => setIsCompletedCampaignsOpen(false)}
          />
        </div>
)}
