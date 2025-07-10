/* eslint-disable @typescript-eslint/prefer-optional-chain */
'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback, useRef } from 'react';
import { authClient } from "~/client/auth";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { type WhatsAppSessionStatus } from "~/types/session";
import { AudienceSelector } from './_components/whatsapp/AudienceSelector';
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
  const [selectedAudienceIds, setSelectedAudienceIds] = useState<string[]>([]);
  const [selectedAudienceNames, setSelectedAudienceNames] = useState<string[]>([]);
  const [selectedAudienceType, setSelectedAudienceType] = useState<'groups' | 'individuals'>('groups');
  const [screenshotKey, setScreenshotKey] = useState(0);

  // New state variable for message sequences
  const [messageSequence, setMessageSequence] = useState<string[]>([]);

  // New state for validating sequence count
  const [sequenceError, setSequenceError] = useState<string | null>(null);

  // New state variables for scheduling
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [messageTime, setMessageTime] = useState('12:00');
  const [timeZone, setTimeZone] = useState('America/Chicago'); // Default to Central Time
  const [messageTemplate, setMessageTemplate] = useState('');
  const [messagePreview, setMessagePreview] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isFreeForm, setIsFreeForm] = useState(false);
  type RecurrenceType = 'DAILY' | 'WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY' | 'SEMI_ANNUALLY' | 'ANNUALLY';
  const [recurrence, setRecurrence] = useState<RecurrenceType | undefined>(undefined);

  // Common time zones for the selector
  const timeZones = [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
    { value: 'Europe/London', label: 'GMT (London)' },
    { value: 'Europe/Paris', label: 'CET (Paris)' },
    { value: 'Europe/Berlin', label: 'CET (Berlin)' },
    { value: 'Asia/Tokyo', label: 'JST (Tokyo)' },
    { value: 'Asia/Shanghai', label: 'CST (Shanghai)' },
    { value: 'Asia/Kolkata', label: 'IST (Mumbai)' },
    { value: 'Australia/Sydney', label: 'AEDT (Sydney)' },
    { value: 'UTC', label: 'UTC' },
  ];

  const recurrenceOptions = [
    { value: 'DAILY', label: 'Daily' },
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'SEMI_MONTHLY', label: 'Semi-Monthly (Twice per Month)' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'SEMI_ANNUALLY', label: 'Semi-Annually (Every 6 Months)' },
    { value: 'ANNUALLY', label: 'Annually' },
  ];

  // State for editing campaigns
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
  const [editingCampaign, setEditingCampaign] = useState<any>(null);
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */

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
    
    // Build message preview with optional fields
    let preview = '';
    
    // Add title if provided
    if (!isFreeForm) {
      if (campaignTitle.trim()) {
        preview += `Campaign Title: ${campaignTitle}\n`;
      }
      
      preview += `Campaign Start Date: ${startDate}\n`;
      preview += `Campaign End Date: ${endDate}\n`;
      
      // Add target amount if provided
      if (targetAmount.trim()) {
        preview += `Contribution Target Amount: ${targetAmount}\n`;
      }
      
      preview += `Days Remaining: ${daysLeft}\n\n`;
    }

    if (messageTemplate.includes("*")){
      const messages = messageTemplate.split('*')[0];
      preview+= messages?.replace(/{days_left}/g, daysLeft.toString());
    }else {
      preview += messageTemplate.replace(/{days_left}/g, daysLeft.toString());
    }
    
    setMessagePreview(preview);
  }, [messageTemplate, startDate, endDate, campaignTitle, targetAmount, isFreeForm]);

  // Update preview when dependencies change
  useEffect(() => {
    updateMessagePreview();
  }, [messageTemplate, startDate, endDate, campaignTitle, targetAmount, updateMessagePreview]);

  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const createCampaign = api.messageCampaign.createCampaign.useMutation({
    onSuccess: () => {
      // Success handled in handleSubmit for multiple campaigns
    },
    onError: (error) => {
      setSubmitStatus({
        type: 'error',
        message: error.message || 'Failed to create message campaign'
      });
    },
  });

  const updateCampaign = api.messageCampaign.updateCampaign.useMutation({
    onSuccess: () => {
      setSubmitStatus({
        type: 'success',
        message: 'Message campaign updated successfully!'
      });
      clearEditMode();
      // refetch campaigns
      void trpcUtils.messageCampaign.getCampaigns.invalidate();
    },
    onError: (error) => {
      setSubmitStatus({
        type: 'error',
        message: error.message || 'Failed to update message campaign'
      });
    },
  });

  // Handle campaign edit
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/prefer-nullish-coalescing */
  const handleEditCampaign = (campaign: any) => {
    setEditingCampaign(campaign);
    // Populate form with existing data
    setCampaignTitle(campaign.title || '');
    setTargetAmount(campaign.targetAmount || '');
    setStartDate(new Date(campaign.startDate).toISOString().split('T')[0] ?? '');
    setEndDate(new Date(campaign.endDate).toISOString().split('T')[0] ?? '');
    
    // Convert sendTimeUtc back to local time format
    const timeStr = typeof campaign.sendTimeUtc === 'string' ? campaign.sendTimeUtc : campaign.sendTimeUtc.toTimeString();
    const timeMatch = timeStr.match(/(\d{2}):(\d{2})/);
    if (timeMatch) {
      setMessageTime(`${timeMatch[1]}:${timeMatch[2]}`);
    }
    
    // Set time zone (default to Central Time for existing campaigns that don't have it stored)
    setTimeZone(campaign.timeZone || 'America/Chicago');
    
    // Handle message sequence if it exists, otherwise use template as single message
    if (campaign.template && campaign.template.includes('*')) {
      setMessageSequence(campaign.template.split('*').map((msg: string) => msg.trim()));
      setMessageTemplate(campaign.template);
    } else {
      setMessageSequence([campaign.template]);
      setMessageTemplate(campaign.template);
    }
    
    setIsRecurring(campaign.isRecurring || false);
    setRecurrence(campaign.recurrence || undefined);
  };
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/prefer-nullish-coalescing */

  // Function to clear edit mode
  const clearEditMode = () => {
    setEditingCampaign(null);
    setStartDate('');
    setEndDate('');
    setMessageTime('12:00');
    setTimeZone('America/Chicago');
    setMessageTemplate('');
    setMessagePreview('');
    setCampaignTitle('');
    setTargetAmount('');
    setIsRecurring(false);
    setRecurrence(undefined);
    setMessageSequence([]);
    setSequenceError(null);
    setSelectedAudienceType('groups');
    setSelectedAudienceIds([]);
    setSelectedAudienceNames([]);
  };

  // Helper function to validate message sequence
  const validateMessageSequence = useCallback((messages: string[]) => {
    if (!isRecurring || 
        !recurrence || 
        !startDate || 
        !endDate || 
        !messageTemplate.includes('*')) return true;

    const recurrenceDaysMap = {
      'DAILY': 1,
      'WEEKLY': 7,
      'SEMI_MONTHLY': 15,
      'MONTHLY': 30,
      'SEMI_ANNUALLY': 182,
      'ANNUALLY': 365
    } as const;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    const sequenceWidth = recurrenceDaysMap[recurrence as keyof typeof recurrenceDaysMap];
    const requiredCount = Math.ceil(daysDiff / sequenceWidth);
    
    if (messages.length !== requiredCount) {
      const errorMessage = `When using asterisks (*) to separate messages, please provide exactly ${requiredCount} message${requiredCount > 1 ? 's' : ''} for ${recurrence.toLowerCase()} recurrence. ` +
        `Each message will be sent every ${sequenceWidth} day${sequenceWidth > 1 ? 's' : ''} over the ${daysDiff}-day period.\n\n` +
        `Or remove the asterisks to use the same message for all occurrences.`;
      setSequenceError(errorMessage);
      return false;
    }
    
    setSequenceError(null);
    return true;
  }, [isRecurring, recurrence, startDate, endDate, messageTemplate]);

  useEffect(() => {
    if (messageTemplate.includes('*')) {
      const messages = messageTemplate.split('*').map(msg => msg.trim()).filter(msg => msg.length > 0);
      if (!validateMessageSequence(messages)) return;
    }
  }, [messageTemplate, isRecurring, recurrence, startDate, endDate, validateMessageSequence]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsAppSession?.sessionName) return;
    if (!editingCampaign && (!selectedAudienceIds.length || !selectedAudienceNames.length)) return;

    // Only validate message sequence if the template contains asterisks
    if (messageTemplate.includes('*')) {
      const messages = messageTemplate.split('*').map(msg => msg.trim()).filter(msg => msg.length > 0);
      if (!validateMessageSequence(messages)) return;
    }

    setSubmitStatus(null);
    
    if (editingCampaign) {
      // Update existing campaign - still single campaign
      updateCampaign.mutate({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        campaignId: editingCampaign.id,
        title: campaignTitle.trim() || undefined,
        targetAmount: targetAmount.trim() || undefined,
        startDate,
        endDate,
        messageTime,
        timeZone,
        messageTemplate,
        isRecurring,
        isFreeForm,
        recurrence: isRecurring ? recurrence : undefined,
        audienceType: selectedAudienceType,
      });
    } else {
      // Create new campaigns - potentially multiple if individuals selected
      if (!selectedAudienceIds.length || !selectedAudienceNames.length) return;
      
      try {
        setSubmitStatus({
          type: 'success',
          message: `Creating ${selectedAudienceIds.length} campaign${selectedAudienceIds.length > 1 ? 's' : ''}...`
        });

        // Create a campaign for each selected audience (group or individual)
        const createCampaignPromises = selectedAudienceIds.map((audienceId, index) => {
          const audienceName = selectedAudienceNames[index];
          if (!audienceName) return Promise.resolve();
          
          return createCampaign.mutateAsync({
            groupId: audienceId,
            groupName: audienceName,
            sessionId: whatsAppSession.id,
            title: campaignTitle.trim() || undefined,
            targetAmount: targetAmount.trim() || undefined,
            startDate,
            endDate,
            messageTime,
            timeZone,
            messageTemplate,
            isRecurring,
            isFreeForm,
            recurrence: isRecurring ? recurrence : undefined,
            audienceType: selectedAudienceType,
          });
        });

        // Wait for all campaigns to be created
        await Promise.all(createCampaignPromises);
        
        setSubmitStatus({
          type: 'success',
          message: `Successfully created ${selectedAudienceIds.length} campaign${selectedAudienceIds.length > 1 ? 's' : ''}!`
        });
        
        // Clear form after successful creation
        setStartDate('');
        setEndDate('');
        setMessageTime('12:00');
        setMessageTemplate('');
        setMessagePreview('');
        setCampaignTitle('');
        setTargetAmount('');
        setSelectedAudienceIds([]);
        setSelectedAudienceNames([]);
        setSelectedAudienceType('groups');
        
        // Refetch campaigns
        void trpcUtils.messageCampaign.getCampaigns.invalidate();
        
      } catch (error) {
        setSubmitStatus({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to create campaigns'
        });
      }
    }
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

  const handleAudienceSelect = (audienceIds: string[], audienceNames: string[], audienceType: 'groups' | 'individuals') => {
    setSelectedAudienceIds(audienceIds);
    setSelectedAudienceNames(audienceNames);
    setSelectedAudienceType(audienceType);
  }

  const handleAudienceTypeChange = (type: 'groups' | 'individuals') => {
    setSelectedAudienceType(type);
    // Clear selection when switching audience types
    setSelectedAudienceIds([]);
    setSelectedAudienceNames([]);
  };


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
                                <CampaignList onEditCampaign={handleEditCampaign} />
                          </div>
                          <h3 className="text-lg font-medium mb-4 mt-8">Select Audience</h3>
                          {!editingCampaign && (
                            <AudienceSelector
                              sessionName={whatsAppSession.sessionName}
                              selectedAudienceIds={selectedAudienceIds}
                              selectedAudienceType={selectedAudienceType}
                              onAudienceSelect={handleAudienceSelect}
                              onAudienceTypeChange={handleAudienceTypeChange}
                            />
                          )}
                          
                          {editingCampaign && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                              <p className="text-sm text-blue-800">
                                {/* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */}
                                <strong>Editing campaign for group:</strong> {editingCampaign.group?.groupName}
                              </p>
                              <p className="text-xs text-blue-600 mt-1">
                                Note: The group cannot be changed when editing a campaign
                              </p>
                            </div>
                          )}
                          
                          {(selectedAudienceIds.length || editingCampaign) && (
                            <div className="mt-6 border-t pt-6">
                              <div className="flex justify-between items-center mb-4">
                                <h4 className="text-lg font-medium">
                                  {editingCampaign ? 'Edit Campaign' : 'Schedule Messages'}
                                </h4>
                                {editingCampaign && (
                                  <button
                                    onClick={clearEditMode}
                                    className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-200 transition-colors"
                                  >
                                    Cancel Edit
                                  </button>
                                )}
                              </div>
                              
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

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label htmlFor="campaignTitle" className="block text-sm font-medium text-gray-700 mb-1">
                                      Campaign Title
                                      <span className="text-xs text-gray-500 ml-2">(Optional)</span>
                                    </label>
                                    <input
                                      type="text"
                                      id="campaignTitle"
                                      value={campaignTitle}
                                      onChange={(e) => setCampaignTitle(e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069]"
                                      placeholder="e.g., Support for the Family of Opuk Ondiek"
                                    />
                                  </div>
                                  
                                  <div>
                                    <label htmlFor="targetAmount" className="block text-sm font-medium text-gray-700 mb-1">
                                      Contribution Target Amount
                                      <span className="text-xs text-gray-500 ml-2">(Optional)</span>
                                    </label>
                                    <input
                                      type="text"
                                      id="targetAmount"
                                      value={targetAmount}
                                      onChange={(e) => setTargetAmount(e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069]"
                                      placeholder="e.g., $10,000"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label htmlFor="messageTime" className="block text-sm font-medium text-gray-700 mb-1">
                                      Time to Send
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
                                    <label htmlFor="timeZone" className="block text-sm font-medium text-gray-700 mb-1">
                                      Time Zone
                                    </label>
                                    <select
                                      id="timeZone"
                                      value={timeZone}
                                      onChange={(e) => setTimeZone(e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069]"
                                      required
                                    >
                                      {timeZones.map((tz) => (
                                        <option key={tz.value} value={tz.value}>
                                          {tz.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id="isRecurring"
                                    checked={isRecurring}
                                    onChange={(e) => {
                                      setIsRecurring(e.target.checked);
                                      if (!e.target.checked) {
                                        setRecurrence(undefined);
                                        setSequenceError(null);
                                      }
                                    }}
                                    className="h-4 w-4 text-[#008069] focus:ring-[#008069] border-gray-300 rounded"
                                  />
                                  <label htmlFor="isRecurring" className="text-sm text-gray-700">
                                    Recurring Messages
                                  </label>
                                </div>

                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id="isFreeForm"
                                    checked={isFreeForm}
                                    onChange={(e) => setIsFreeForm(e.target.checked)}
                                    className="h-4 w-4 text-[#008069] focus:ring-[#008069] border-gray-300 rounded"
                                  />
                                  <label htmlFor="isFreeForm" className="text-sm font-medium text-gray-700">
                                    Make this a free form message campaign
                                  </label>
                                </div>

                                {isRecurring && (
                                  <div>
                                    <label htmlFor="recurrence" className="block text-sm font-medium text-gray-700 mb-1">
                                      Recurrence Pattern
                                    </label>
                                    <select
                                      id="recurrence"
                                      value={recurrence ?? ''}
                                      onChange={(e) => {
                                        setRecurrence(e.target.value as RecurrenceType);
                                        setSequenceError(null);
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069]"
                                      required={isRecurring}
                                    >
                                      <option value="">Select a pattern</option>
                                      {recurrenceOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}

                                <div>
                                  <label htmlFor="messageTemplate" className="block text-sm font-medium text-gray-700 mb-1">
                                    Message Template
                                  </label>
                                  <div className="relative">
                                    <textarea
                                      id="messageTemplate"
                                      value={messageTemplate}
                                      onChange={(e) => {
                                        setMessageTemplate(e.target.value);
                                        const messages = e.target.value.split('*').map(msg => msg.trim()).filter(msg => msg.length > 0);
                                        setMessageSequence(messages);
                                        if (isRecurring && recurrence) {
                                          validateMessageSequence(messages);
                                        }
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069] min-h-[120px]"
                                      placeholder={isRecurring ? "Enter messages separated by * (asterisk). Example:\nMessage for first period * Message for second period" : "Enter your message"}
                                      required
                                    />
                                    {isRecurring && recurrence && (
                                      <div className="absolute right-2 bottom-2 text-xs text-gray-500">
                                        {messageSequence.length} / {recurrence === 'DAILY' ? '1' :
                                          recurrence === 'WEEKLY' ? '7' :
                                          recurrence === 'SEMI_MONTHLY' ? '2' :
                                          recurrence === 'MONTHLY' ? '12' :
                                          recurrence === 'SEMI_ANNUALLY' ? '2' : '1'} messages
                                      </div>
                                    )}
                                  </div>
                                  {sequenceError && (
                                    <p className="mt-1 text-sm text-red-600">
                                      {sequenceError}
                                    </p>
                                  )}
                                  {isRecurring && !sequenceError && (
                                    <p className="mt-1 text-sm text-gray-500">
                                      Separate multiple messages with an asterisk (*). Each message will be sent according to the recurrence pattern.
                                    </p>
                                  )}
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
                                  disabled={
                                    (editingCampaign ? updateCampaign.isPending : createCampaign.isPending) || 
                                    !startDate || !endDate || !messageTemplate || 
                                    (isRecurring && !recurrence) ||
                                    (!editingCampaign && (!selectedAudienceIds.length || !selectedAudienceNames.length))
                                  }
                                >
                                  {editingCampaign 
                                    ? (updateCampaign.isPending ? 'Updating Campaign...' : 'Update Campaign')
                                    : (createCampaign.isPending ? 'Creating Campaign...' : 'Schedule Messages')
                                  }
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
