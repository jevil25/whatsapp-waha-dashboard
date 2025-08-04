'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback, useRef } from 'react';
import { authClient } from "~/client/auth";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { type WhatsAppSessionStatus } from "~/types/session";
import { AudienceSelector } from './_components/whatsapp/AudienceSelector';
import { CampaignList, type Status, type Campaign as CampaignType, type Message } from './_components/whatsapp/CampaignList';
import { CompletedCampaignsModal } from './_components/whatsapp/CompletedCampaignsModal';
import { MediaUpload } from './_components/whatsapp/MediaUpload';

export default function Home() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  const [scheduleType, setScheduleType] = useState<'message' | 'status'>('message');

  const [isCompletedCampaignsOpen, setIsCompletedCampaignsOpen] = useState(false);
  const [isActiveCampaignsCollapsed, setIsActiveCampaignsCollapsed] = useState(true);
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

  // Comprehensive time zones for the selector
  const timeZones = [
    // North America
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
    { value: 'America/Toronto', label: 'Eastern Time - Toronto (ET)' },
    { value: 'America/Vancouver', label: 'Pacific Time - Vancouver (PT)' },
    
    // Europe
    { value: 'Europe/London', label: 'GMT (London)' },
    { value: 'Europe/Paris', label: 'CET (Paris)' },
    { value: 'Europe/Berlin', label: 'CET (Berlin)' },
    { value: 'Europe/Rome', label: 'CET (Rome)' },
    { value: 'Europe/Madrid', label: 'CET (Madrid)' },
    { value: 'Europe/Amsterdam', label: 'CET (Amsterdam)' },
    
    // Africa - East Africa Time and others
    { value: 'Africa/Nairobi', label: 'EAT - East Africa Time (Nairobi)' },
    { value: 'Africa/Addis_Ababa', label: 'EAT - East Africa Time (Addis Ababa)' },
    { value: 'Africa/Dar_es_Salaam', label: 'EAT - East Africa Time (Dar es Salaam)' },
    { value: 'Africa/Kampala', label: 'EAT - East Africa Time (Kampala)' },
    { value: 'Africa/Lagos', label: 'WAT - West Africa Time (Lagos)' },
    { value: 'Africa/Accra', label: 'GMT - Ghana Mean Time (Accra)' },
    { value: 'Africa/Johannesburg', label: 'SAST - South Africa Standard Time' },
    { value: 'Africa/Cairo', label: 'EET - Eastern European Time (Cairo)' },
    { value: 'Africa/Casablanca', label: 'WET - Western European Time (Casablanca)' },
    
    // Asia
    { value: 'Asia/Tokyo', label: 'JST (Tokyo)' },
    { value: 'Asia/Shanghai', label: 'CST (Shanghai)' },
    { value: 'Asia/Kolkata', label: 'IST (Mumbai)' },
    { value: 'Asia/Dubai', label: 'GST (Dubai)' },
    { value: 'Asia/Singapore', label: 'SGT (Singapore)' },
    { value: 'Asia/Hong_Kong', label: 'HKT (Hong Kong)' },
    
    // Australia/Oceania
    { value: 'Australia/Sydney', label: 'AEDT (Sydney)' },
    { value: 'Australia/Melbourne', label: 'AEDT (Melbourne)' },
    { value: 'Australia/Perth', label: 'AWST (Perth)' },
    
    // Other
    { value: 'UTC', label: 'UTC' },
  ];

  const recurrenceOptions = [
    { value: 'ONE_TIME', label: 'One-Time' },
    { value: 'DAILY', label: 'Daily' },
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'SEMI_MONTHLY', label: 'Semi-Monthly (Twice per Month)' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'SEMI_ANNUALLY', label: 'Semi-Annually (Every 6 Months)' },
    { value: 'ANNUALLY', label: 'Annually' },
  ];

  // State for editing campaigns
  interface Campaign {
    id: string;
    title?: string;
    targetAmount?: string;
    startDate: Date | string;
    endDate: Date | string;
    sendTimeUtc: Date | string;
    timeZone: string;
    template: string;
    status: string;
    createdAt: Date | string;
    isRecurring: boolean;
    isFreeForm: boolean;
    recurrence?: 'DAILY' | 'WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY' | 'SEMI_ANNUALLY' | 'ANNUALLY';
    group?: {
      id: string;
      groupName: string;
      groupId: string;
    };
    messages?: Array<{
      id: string;
      content: string;
      scheduledAt: Date | string;
      sentAt?: Date | string;
      isSent: boolean;
      isFailed: boolean;
      hasImage: boolean;
      imageUrl?: string;
      imagePublicId?: string;
      hasVideo: boolean;
      videoUrl?: string;
      videoPublicId?: string;
    }>;
    statuses?: Array<{
      id: string;
      content: string;
      scheduledAt: Date | string;
      sentAt?: Date | string;
      isSent: boolean;
      isFailed: boolean;
      hasImage: boolean;
      imageUrl?: string;
      imagePublicId?: string;
      hasVideo: boolean;
      videoUrl?: string;
      videoPublicId?: string;
    }>;
  };
  const [editingCampaign, setEditingCampaign] = useState<CampaignType | Status | null>(null);
  
  // State for image uploads
  const [media, setMedia] = useState<Array<{ url: string; publicId: string; type: 'image' | 'video'; file?: File }>>([]);

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
    if (!messageTemplate || !startDate) {
      setMessagePreview('');
      return;
    }

    // For one-time campaigns, use startDate as endDate
    const finalEndDate = !isRecurring ? startDate : endDate;
    if (isRecurring && !finalEndDate) {
      setMessagePreview('');
      return;
    }

    const endDateObj = new Date(finalEndDate);
    const today = new Date();
    const daysLeft = Math.ceil((endDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    // Build message preview with optional fields
    let preview = '';
    
    // Add title if provided
    if (!isFreeForm) {
      if (campaignTitle.trim()) {
        preview += `Campaign: ${campaignTitle}\n`;
      }
      
      preview += `Start Date: ${startDate}\n`;
      if (isRecurring) {
        preview += `End Date: ${finalEndDate}\n`;
      }
      
      // Add target amount if provided
      if (targetAmount.trim()) {
        preview += `Target Amount: ${targetAmount}\n`;
      }
      
      preview += `Days Remaining: ${daysLeft}\n\n`;
    }

    if (messageTemplate.includes("*")){
      const messages = messageTemplate.split('*')[0];
      preview += messages?.replace(/{days_left}/g, daysLeft.toString());
    } else {
      preview += messageTemplate.replace(/{days_left}/g, daysLeft.toString());
    }
    
    setMessagePreview(preview);
  }, [messageTemplate, startDate, endDate, campaignTitle, targetAmount, isFreeForm, isRecurring]);

  // Update preview when dependencies change
  useEffect(() => {
    updateMessagePreview();
  }, [messageTemplate, startDate, endDate, campaignTitle, targetAmount, updateMessagePreview]);

  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const createCampaign = api.messageCampaignV2.createCampaign.useMutation({
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

  const createStatus = api.messageCampaignV2.createStatus.useMutation({
    onSuccess: () => {
      setSubmitStatus({
        type: 'success',
        message: 'Status update campaign created successfully!'
      });
      clearEditMode();
      // refetch campaigns
      void trpcUtils.messageCampaign.getCampaigns.invalidate();
    },
    onError: (error) => {
      setSubmitStatus({
        type: 'error',
        message: error.message || 'Failed to create status update campaign'
      });
    },
  });

  const updateCampaign = api.messageCampaignV2.updateCampaign.useMutation({
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
        message: error.message ?? 'Failed to update message campaign'
      });
    },
  });

  const updateStatus = api.messageCampaignV2.updateStatus.useMutation({
    onSuccess: () => {
      setSubmitStatus({
        type: 'success',
        message: 'Status update campaign updated successfully!'
      });
      clearEditMode();
      // refetch campaigns
      void trpcUtils.messageCampaign.getCampaigns.invalidate();
    },
    onError: (error) => {
      setSubmitStatus({
        type: 'error',
        message: error.message ?? 'Failed to update status update campaign'
      });
    },
  });


const extractMediaFromMessages = (messages: Message[]) => {
  const seen = new Set<string>();
  const result = [];

  for (const msg of messages) {
    const candidates = [];

    if (msg.hasImage && msg.imageUrl) {
      candidates.push({
        url: msg.imageUrl,
        publicId: msg.imagePublicId,
        type: 'image',
      });
    }

    if (msg.hasVideo && msg.videoUrl) {
      candidates.push({
        url: msg.videoUrl,
        publicId: msg.videoPublicId,
        type: 'video',
      });
    }

    for (const item of candidates) {
      const key = item.publicId ?? item.url;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
  }

  console.log(`result: ${result.length}`)

  return result;
};

  const handleEditCampaign = (campaign: CampaignType) => {
    setScheduleType("message");
    setEditingCampaign(campaign);
    setCampaignTitle(campaign.title ?? '');
    setTargetAmount(campaign.targetAmount ?? '');
    
    // Set media from messages
    setMedia(extractMediaFromMessages(campaign.messages));
    
    // Format dates properly for HTML date inputs (YYYY-MM-DD)
    const startDateFormatted = new Date(campaign.startDate).toISOString().split('T')[0] ?? '';
    const endDateFormatted = new Date(campaign.endDate).toISOString().split('T')[0] ?? '';
    
    setStartDate(startDateFormatted);
    setEndDate(endDateFormatted);
    
    // Format time from sendTimeUtc - convert from UTC to campaign's timezone
    const utcTime = new Date(campaign.sendTimeUtc);
    
    // Convert UTC time to the campaign's timezone
    const localTime = new Date(utcTime.toLocaleString("en-US", { timeZone: campaign.timeZone }));
    
    const hours = localTime.getHours().toString().padStart(2, '0');
    const minutes = localTime.getMinutes().toString().padStart(2, '0');
    setMessageTime(`${hours}:${minutes}`);
    
    setTimeZone(campaign.timeZone);
    setMessageTemplate(campaign.template);
    setIsRecurring(campaign.isRecurring);
    setIsFreeForm(campaign.isFreeForm);
    setRecurrence(campaign.recurrence ? campaign.recurrence : undefined);
    
    // Load existing media if any
    const existingMedia = campaign.messages?.flatMap((msg) => {
      const mediaItems: Array<{ url: string; publicId: string; type: 'image' | 'video' }> = [];
      if (msg.hasImage && msg.imageUrl && msg.imagePublicId) {
        mediaItems.push({ url: msg.imageUrl, publicId: msg.imagePublicId, type: 'image' });
      }
      if (msg.hasVideo && msg.videoUrl && msg.videoPublicId) {
        mediaItems.push({ url: msg.videoUrl, publicId: msg.videoPublicId, type: 'video' });
      }
      return mediaItems;
    }) ?? [];
    setMedia(existingMedia);
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
  };

  const handleEditStatus = (status: Status) => {
    setScheduleType("status");
    setEditingCampaign(status);
    setCampaignTitle(status.title ?? '');
    
    // Format dates properly for HTML date inputs (YYYY-MM-DD)
    const startDateFormatted = new Date(status.startDate).toISOString().split('T')[0] ?? '';
    const endDateFormatted = new Date(status.endDate).toISOString().split('T')[0] ?? '';
    
    setStartDate(startDateFormatted);
    setEndDate(endDateFormatted);
    
    // Format time from sendTimeUtc - convert from UTC to status's timezone
    const utcTime = new Date(status.sendTimeUtc);
    
    // Convert UTC time to the status's timezone
    const localTime = new Date(utcTime.toLocaleString("en-US", { timeZone: status.timeZone }));
    
    const hours = localTime.getHours().toString().padStart(2, '0');
    const minutes = localTime.getMinutes().toString().padStart(2, '0');
    setMessageTime(`${hours}:${minutes}`);
    
    setTimeZone(status.timeZone);
    setMessageTemplate(status.template);
    setIsRecurring(status.isRecurring);
    setRecurrence(status.recurrence ? status.recurrence : undefined);
    
    // Set media from status messages
    setMedia(extractMediaFromMessages(status.statuses));
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
    
    // Clear campaign-specific fields since this is a status update
    setCampaignTitle('');
    setTargetAmount('');
    setSelectedAudienceIds([]);
    setSelectedAudienceNames([]);
    setSelectedAudienceType('groups');
    setIsFreeForm(false);
  };

  const clearEditMode = () => {
    setEditingCampaign(null);
    setCampaignTitle('');
    setTargetAmount('');
    setStartDate('');
    setEndDate('');
    setMessageTime('12:00');
    setTimeZone('America/Chicago');
    setMessageTemplate('');
    setIsRecurring(false);
    setMedia([]);
    setIsFreeForm(false);
    setRecurrence(undefined);
    setSubmitStatus(null);
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
    if (!editingCampaign && scheduleType == "message" && (!selectedAudienceIds.length || !selectedAudienceNames.length)) return;

    // Only validate message sequence if the template contains asterisks
    if (messageTemplate.includes('*')) {
      const messages = messageTemplate.split('*').map(msg => msg.trim()).filter(msg => msg.length > 0);
      if (!validateMessageSequence(messages)) return;
    }

    setSubmitStatus(null);
    
    // For one-time campaigns, ensure end date is same as start date
    const finalEndDate = !isRecurring ? startDate : endDate;
    
    if (editingCampaign) {
      if (scheduleType === 'status') {
        // Update status update campaign
        try {
          setSubmitStatus({
            type: 'success',
            message: `Updating status update campaign...`
          });
          await updateStatus.mutateAsync({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            sessionId: whatsAppSession.id,
            statusCampaignId: editingCampaign.id,
            title: campaignTitle.trim() || undefined,
            endDate: finalEndDate,
            messageTime,
            timeZone,
            statusText: messageTemplate,
            isRecurring,
            isFreeForm,
            recurrence: isRecurring ? recurrence : undefined,
            media: media.length > 0 ? media : undefined,
            startDate: startDate,
          });
          setSubmitStatus({
            type: 'success',
            message: 'Status update campaign updated successfully!'
          });
          // Clear form after successful update
          clearEditMode();
          // Refetch campaigns
          void trpcUtils.messageCampaign.getCampaigns.invalidate();
        } catch (error) {
          setSubmitStatus({
            type: 'error',
            message: error instanceof Error ? error.message : 'Failed to update status update campaign'
          });
        }
        return;
      }
      // Update existing campaign - still single campaign
      // If no new media is provided, keep the existing media from the campaign
      const updatedMedia = media.length > 0 ? media : ('media' in editingCampaign ? editingCampaign.media : undefined);

      updateCampaign.mutate({
        sessionId: whatsAppSession.id,
        campaignId: editingCampaign.id,
        startDate,
        endDate: finalEndDate,
        messageTime,
        timeZone,
        messageTemplate,
        isRecurring,
        isFreeForm,
        title: campaignTitle.trim() || undefined,
        targetAmount: targetAmount.trim() || undefined,
        recurrence: isRecurring ? recurrence : undefined,
        audienceType: selectedAudienceType,
        media: updatedMedia as {
            url: string;
            type: "image" | "video";
            publicId: string;
        }[] | undefined,
      });
    } else {
      if (scheduleType === 'status') {
        // Create status update campaign
        try {
          setSubmitStatus({
            type: 'success',
            message: `Creating status update campaign...`
          });
          await createStatus.mutateAsync({
            sessionId: whatsAppSession.id,
            endDate: finalEndDate,
            messageTime,
            timeZone,
            statusText: messageTemplate,
            isRecurring,
            isFreeForm,
            recurrence: isRecurring ? recurrence : undefined,
            media: media.length > 0 ? media : undefined,
            startDate: startDate,
          });
          setSubmitStatus({
            type: 'success',
            message: 'Status update campaign created successfully!'
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
          setMedia([]);
          // Refetch campaigns
          void trpcUtils.messageCampaign.getCampaigns.invalidate();
        } catch (error) {
          setSubmitStatus({
            type: 'error',
            message: error instanceof Error ? error.message : 'Failed to create status update campaign'
          });
        }
        return;
      }

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
            endDate: finalEndDate,
            messageTime,
            timeZone,
            messageTemplate,
            isRecurring,
            isFreeForm,
            recurrence: isRecurring ? recurrence : undefined,
            audienceType: selectedAudienceType,
            media: media.length > 0 ? media : undefined,
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
          setMedia([]);
          
          // Refetch campaigns
          void trpcUtils.messageCampaign.getCampaigns.invalidate();      } catch (error) {
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
    setSubmitStatus(null);
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

  // Regular user view with TrueSenger style
  return (
    <div>
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        {/* TrueSenger Header */}
        <div className="bg-gradient-to-r from-[#d97809] to-[#d97809] text-white px-4 py-4 shadow-lg">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="bg-white/10 p-2 rounded-lg">
                <span className="text-2xl">🌟</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold">TrueSenger</h1>
                <p className="text-sm text-orange-100">TRUEFAM WhatsApp Message Scheduler</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {session.user.role === 'ADMIN' && (
                <button
                  onClick={() => router.push('/admin')}
                  className="text-sm bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20 transition-colors backdrop-blur-sm"
                >
                  Admin Dashboard
                </button>
              )}
              <button
                onClick={handleSignOut}
                className="text-sm bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20 transition-colors backdrop-blur-sm"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-6">
          {/* Connection Status Section */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-[#d97809]">
            {isWhatsAppLoading ? (
              <div className="space-y-4">
                <div className="animate-pulse space-y-4">
                  <div className="h-32 rounded-xl" style={{ backgroundColor: '#ffd9b3' }}></div>
                </div>
              </div>
            ) : whatsAppSession ? (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-[#fff3e0] to-[#ffd9b3] border border-[#d97809] rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#ffd9b3' }}>
                        <span className="text-xl" style={{ color: '#d97809' }}>📱</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800">WhatsApp Connected</h3>
                        <p className="text-sm text-gray-600">{whatsAppSession.phoneNumber}</p>
                      </div>
                    </div>
                    {(() => {
                      if (typeof whatsAppSession.sessionName !== 'string') return null;

                      switch (sessionStatus) {
                        case 'WORKING':
                          return (
                            <div className="flex items-center gap-4">
                              <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#e6f7e6', color: '#228B22' }}>✅ Connected</span>
                              <button
                                onClick={() => logoutSession.mutate({ sessionName: whatsAppSession.sessionName })}
                                className="text-xs px-3 py-1 rounded-full hover:bg-[#ffe0b2] transition-colors"
                                style={{ backgroundColor: '#ffd9b3', color: '#d97809' }}
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
                              className="text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-full hover:bg-amber-200 transition-colors"
                            >
                              {restartSession.isPending ? 'Restarting...' : 'Restart'}
                            </button>
                          );
                        case 'STARTING':
                          return <span className="text-xs px-3 py-1 rounded-full" style={{ backgroundColor: '#ffd9b3', color: '#d97809' }}>🔄 Starting...</span>;
                        case 'SCAN_QR_CODE':
                          return <span className="text-xs px-3 py-1 rounded-full" style={{ backgroundColor: '#ffd9b3', color: '#d97809' }}>📱 Waiting for QR Scan</span>;
                        default:
                          return null;
                      }
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-[#ffd9b3] to-[#fff3e0] border border-[#d97809] rounded-xl p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#ffd9b3' }}>
                      <span className="text-xl" style={{ color: '#d97809' }}>⚠️</span>
                    </div>
                    <div>
                      <p className="font-semibold text-amber-800">No WhatsApp Connection</p>
                      <p className="text-sm text-amber-700">Connect your WhatsApp account to start managing your campaigns.</p>
                    </div>
                  </div>
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Connect WhatsApp</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Status: <span className="font-medium">{sessionStatus ?? 'Not Connected'}</span>
                  </p>
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                      <p className="text-red-700 font-medium">{error}</p>
                    </div>
                  )}
                  {!isConnecting && (
                    <button
                      onClick={handleConnect}
                      style={{ background: '#d97809' }}
                      className="text-white px-6 py-3 rounded-xl hover:bg-[#b85e07] transition-all shadow-lg font-medium"
                      disabled={initSession.isPending}
                    >
                      {initSession.isPending ? 'Initializing...' : '📱 Connect WhatsApp'}
                    </button>
                  )}
                  
                </div>
              </div>
            )}
            {/* QR Code and Session Status */}
            <div className="space-y-4 mt-6">
              <div className="bg-white rounded-2xl shadow-lg border border-[#d97809] overflow-visible">
                {sessionStatus === 'STARTING' && (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#d97809' }}></div>
                    <span className="ml-3 text-sm text-gray-600">
                      Starting WhatsApp session...
                    </span>
                  </div>
                )}

                {sessionStatus === 'SCAN_QR_CODE' && (
                  <div className="p-6">
                    <div className="bg-gradient-to-r from-[#fff3e0] to-[#ffd9b3] rounded-xl p-6 mb-6">
                      <h4 className="font-semibold text-gray-800 mb-4 text-center">📱 Scan QR Code to Connect</h4>
                      <div className="space-y-6">
                        <div className="text-sm text-gray-700">
                          <p className="font-medium mb-2">Follow these steps:</p>
                          <ol className="list-decimal list-inside space-y-1 text-sm">
                            <li>Open WhatsApp on your phone</li>
                            <li>Tap Menu (⋮) or Settings</li>
                            <li>Select &quot;Linked Devices&quot;</li>
                            <li>Tap &quot;Link a Device&quot;</li>
                            <li>Point your camera at the QR code</li>
                          </ol>
                        </div>
                        <div className="bg-[#fff3e0] border border-[#d97809] rounded-lg p-3">
                          <div className="flex items-start">
                            <div className="mr-2" style={{ color: '#d97809' }}>💡</div>
                            <div>
                              <p className="text-sm" style={{ color: '#d97809' }}>
                                <strong>Tip:</strong> If the status doesn&apos;t change to &quot;Connected&quot; after scanning, please refresh the page.
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="relative w-[600px] h-[400px] bg-white border-2 rounded-xl p-4 shadow-sm" style={{ borderColor: '#d97809' }}>
                            {whatsAppSession?.sessionName ? (
                              <Image 
                                key={screenshotKey}
                                src={`/api/screenshot?session=${whatsAppSession.sessionName}&_=${screenshotKey}`}
                                alt="WhatsApp QR Code"
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
                                <p className="text-sm text-gray-500">Loading QR code...</p>
                              </div>
                            )}
                          </div>
                          <div className="mt-4 flex items-center gap-3">
                            <button
                              onClick={handleRefreshScreen}
                              className="text-sm px-3 py-2 rounded-lg hover:bg-[#ffe0b2] transition-colors flex items-center gap-2"
                              style={{ backgroundColor: '#ffd9b3', color: '#d97809' }}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Refresh
                            </button>
                            <span className="text-sm text-gray-500">Auto-refreshes every 15s</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {(sessionStatus === 'STOPPED' || sessionStatus === 'FAILED') && (
                  <div className="p-6">
                    <div className="bg-gradient-to-r from-[#ffd9b3] to-[#fff3e0] border border-[#d97809] rounded-xl p-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#ffd9b3' }}>
                          <span className="text-xl" style={{ color: '#d97809' }}>⚠️</span>
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-amber-800">Session {sessionStatus === 'STOPPED' ? 'Stopped' : 'Failed'}</p>
                          <p className="text-sm text-amber-700">
                            {sessionStatus === 'STOPPED'
                              ? 'The WhatsApp session is currently stopped.'
                              : 'There was an error with the WhatsApp session.'}
                          </p>
                        </div>
                        {currentSessionName && (
                          <button
                            onClick={() => handleRestart(currentSessionName)}
                            className="px-4 py-2 rounded-lg hover:bg-[#ffe0b2] transition-colors font-medium"
                            style={{ backgroundColor: '#ffd9b3', color: '#d97809' }}
                            disabled={restartSession.isPending}
                          >
                            {restartSession.isPending ? 'Restarting...' : 'Restart'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Main TrueSenger Form */}
                {sessionStatus === 'WORKING' && whatsAppSession?.sessionName && (
                  <div className="space-y-6">
                    {/* Active Campaigns Section */}
                    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="text-xl font-semibold text-gray-800 flex items-center">
                          <span className="mr-2">📊</span>
                          Active Campaigns
                        </h4>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setIsActiveCampaignsCollapsed(!isActiveCampaignsCollapsed)}
                            className="bg-blue-100 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-200 transition-colors flex items-center gap-2 font-medium"
                          >
                            <svg 
                              className={`w-4 h-4 transition-transform ${isActiveCampaignsCollapsed ? 'rotate-180' : ''}`} 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            {isActiveCampaignsCollapsed ? 'Expand' : 'Collapse'}
                          </button>
                          <button
                            onClick={() => setIsCompletedCampaignsOpen(true)}
                            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            View Completed
                          </button>
                        </div>
                      </div>
                      {!isActiveCampaignsCollapsed && (
                        <CampaignList onEditCampaign={handleEditCampaign} onEditStatus={handleEditStatus} />
                      )}
                      {isActiveCampaignsCollapsed && (
                        <div className="text-center py-4 text-gray-500">
                          <p className="text-sm">Active campaigns list is collapsed. Click &quot;Expand&quot; to view.</p>
                        </div>
                      )}
                    </div>

                    {/* TrueSenger Message Scheduler */}
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-visible">
                      <div className="bg-gradient-to-r from-[#d97809] to-[#d97809] text-white p-6">
                        <div className="flex items-center space-x-3">
                          <div className="bg-white/20 p-2 rounded-lg">
                            <span className="text-2xl">🌟</span>
                          </div>
                          <div>
                            <h3 className="text-2xl font-bold">TrueSenger</h3>
                            <p className="text-blue-100 mt-1">Create and schedule your WhatsApp campaigns</p>
                          </div>
                        </div>
                      </div>

                      {/* set schedule type option */}
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-semibold text-gray-800 flex items-center">
                            <span className="mr-2">🗓️</span>
                            Schedule Type
                          </h4>
                          <div className="flex items-center space-x-4">
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="radio"
                                name="scheduleType"
                                value="message"
                                checked={scheduleType === 'message'}
                                onChange={() => setScheduleType('message')}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                              />
                              <span className="ml-2 text-sm text-gray-700">Campaign</span>
                            </label>
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="radio"
                                name="scheduleType"
                                value="status"
                                checked={scheduleType === 'status'}
                                onChange={() => setScheduleType('status')}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                              />
                              <span className="ml-2 text-sm text-gray-700">Status Update</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 overflow-visible">
                        {scheduleType == "message" && (
                          <>
                        {/* 1. Audience Settings */}
                        <div className="mb-8">
                          <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <span className="mr-2">1️⃣</span>
                            <span className="mr-2">👥</span>
                            Audience Settings
                          </h4>
                              <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-sm text-gray-700 mb-3 font-medium">Select who you want to send the message to:</p>
                            <div className="space-y-2">
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="radio"
                                  name="audienceType"
                                  value="groups"
                                  checked={selectedAudienceType === 'groups'}
                                  onChange={() => handleAudienceTypeChange('groups')}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                />
                                <span className="ml-2 text-sm text-gray-700">🔘 Groups</span>
                              </label>
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="radio"
                                  name="audienceType"
                                  value="individuals"
                                  checked={selectedAudienceType === 'individuals'}
                                  onChange={() => handleAudienceTypeChange('individuals')}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                />
                                <span className="ml-2 text-sm text-gray-700">🔘 Individuals (Max 15 recipients per campaign)</span>
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* 2. Recipient Selection */}
                        <div className="mb-8">
                          <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <span className="mr-2">2️⃣</span>
                            <span className="mr-2">📌</span>
                            Recipient Selection
                          </h4>
                              <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-sm text-gray-700 mb-3 font-medium">Select Group(s) or Individual(s):</p>
                            {selectedAudienceType === 'individuals' && (
                              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-sm text-blue-700">✅ <strong>Note:</strong> You may select up to 15 individuals per campaign.</p>
                              </div>
                            )}
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
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
                                  {/* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */}
                                  <strong>Editing campaign for group:</strong> {'group' in editingCampaign ? editingCampaign.group?.groupName : 'Status Update'}
                                </p>
                                <p className="text-xs text-blue-600 mt-1">
                                  Note: You can edit campaigns even after they&apos;ve started sending. Only future unsent messages will be updated.
                                </p>
                                <p className="text-xs text-blue-600">
                                  The group cannot be changed when editing a campaign.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                        </>)}

                        {/* Status Messages */}
                        {submitStatus && (
                          <div className={`p-4 rounded-xl ${
                            submitStatus.type === 'success' 
                              ? 'bg-green-50 border border-green-200 text-green-800' 
                              : 'bg-red-50 border border-red-200 text-red-800'
                          }`}>
                            <div className="flex items-center">
                              <span className="mr-2">
                                {submitStatus.type === 'success' ? '✅' : '❌'}
                              </span>
                              {submitStatus.message}
                            </div>
                          </div>
                        )}

                        {/* Show form only if audience is selected or editing */}
                        {((selectedAudienceIds.length || editingCampaign) ?? scheduleType == "status") && (
                          <div className="space-y-8">
                            {/* Form Header */}
                            <div className="flex justify-between items-center">
                              <h4 className="text-xl font-semibold text-gray-800">
                                {editingCampaign ? '✏️ Edit ' : '📝 Create New '}{scheduleType === 'message' ? 'Message Campaign' : 'Status Update'}
                              </h4>
                              {editingCampaign && (
                                <button
                                  onClick={clearEditMode}
                                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                                >
                                  Cancel Edit
                                </button>
                              )}
                            </div>

                            <form className="space-y-8" onSubmit={handleSubmit}>
                              {/* 3. Message Frequency & Timing */}
                              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                  <span className="mr-2">{scheduleType === "status" ? "1️⃣" : "3️⃣"}</span>
                                  <span className="mr-2">⏰</span>
                                  Message Frequency & Timing
                                </h4>
                                
                                <div className="space-y-4">
                                  {/* Frequency Options */}
                                  <div>
                                    <p className="text-sm text-gray-700 mb-3 font-medium">Frequency Options: Select how often you want messages sent:</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                      {recurrenceOptions.map((option) => (
                                        <label key={option.value} className="flex items-center cursor-pointer bg-white rounded-lg p-3 border border-gray-200 hover:border-blue-300 transition-colors">
                                          <input
                                            type="radio"
                                            name="frequency"
                                            value={option.value}
                                            checked={option.value === 'ONE_TIME' ? !isRecurring : (isRecurring && recurrence === option.value)}
                                            onChange={() => {
                                              if (option.value === 'ONE_TIME') {
                                                setIsRecurring(false);
                                                setRecurrence(undefined);
                                              } else {
                                                setIsRecurring(true);
                                                setRecurrence(option.value as RecurrenceType);
                                              }
                                              setSequenceError(null);
                                            }}
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                          />
                                          <span className="ml-2 text-sm text-gray-700">🔘 {option.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Date and Time Selection */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-2">
                                        📅 {!isRecurring ? 'Send Date' : 'Start Date'}
                                      </label>
                                      <input
                                        type="date"
                                        id="startDate"
                                        value={startDate}
                                        onChange={(e) => {
                                          setStartDate(e.target.value);
                                          // For one-time campaigns, set end date same as start date
                                          if (!isRecurring) {
                                            setEndDate(e.target.value);
                                          }
                                        }}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        min={new Date().toISOString().split('T')[0]}
                                        required
                                      />
                                    </div>
                                    
                                    {isRecurring && (
                                      <div>
                                        <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-2">
                                          📅 End Date
                                        </label>
                                        <input
                                          type="date"
                                          id="endDate"
                                          value={endDate}
                                          onChange={(e) => setEndDate(e.target.value)}
                                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                          min={startDate || new Date().toISOString().split('T')[0]}
                                          required
                                        />
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label htmlFor="messageTime" className="block text-sm font-medium text-gray-700 mb-2">
                                        🕒 Time to Send
                                      </label>
                                      <input
                                        type="time"
                                        id="messageTime"
                                        value={messageTime}
                                        onChange={(e) => setMessageTime(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        required
                                      />
                                    </div>
                                    
                                    <div>
                                      <label htmlFor="timeZone" className="block text-sm font-medium text-gray-700 mb-2">
                                        🌍 Time Zone
                                      </label>
                                      <select
                                        id="timeZone"
                                        value={timeZone}
                                        onChange={(e) => setTimeZone(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                </div>
                              </div>

                              {/* 4. Message Type */}
                              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                  <span className="mr-2">{scheduleType === "status" ? "2️⃣" : "4️⃣"}</span>
                                  <span className="mr-2">📝</span>
                                  Message Type
                                </h4>
                                
                                <div className="space-y-3">
                                  <p className="text-sm text-gray-700 font-medium">Message Format:</p>
                                  <div className="space-y-2">
                                    <label className="flex items-center cursor-pointer bg-white rounded-lg p-3 border border-gray-200 hover:border-green-300 transition-colors">
                                      <input
                                        type="radio"
                                        name="messageType"
                                        checked={!isFreeForm}
                                        onChange={() => setIsFreeForm(false)}
                                        className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300"
                                      />
                                      <span className="ml-2 text-sm text-gray-700">🔘 Structured Message</span>
                                    </label>
                                    <label className="flex items-center cursor-pointer bg-white rounded-lg p-3 border border-gray-200 hover:border-green-300 transition-colors">
                                      <input
                                        type="radio"
                                        name="messageType"
                                        checked={isFreeForm}
                                        onChange={() => setIsFreeForm(true)}
                                        className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300"
                                      />
                                      <span className="ml-2 text-sm text-gray-700">🔘 Free Form Message</span>
                                    </label>
                                  </div>
                                </div>
                              </div>

                              {/* 5. Structured Message Fields */}
                              {!isFreeForm && scheduleType === "message" && (
                                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
                                  <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                    <span className="mr-2">5️⃣</span>
                                    <span className="mr-2">📣</span>
                                    Campaign Details
                                  </h4>
                                  
                                  <div className="space-y-4">
                                    <div>
                                      <label htmlFor="campaignTitle" className="block text-sm font-medium text-gray-700 mb-2">
                                        Campaign Title
                                      </label>
                                      <input
                                        type="text"
                                        id="campaignTitle"
                                        value={campaignTitle}
                                        onChange={(e) => setCampaignTitle(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        placeholder="e.g., Support for the Family of Opuk Ondiek"
                                      />
                                    </div>
                                    
                                    <div>
                                      <label htmlFor="targetAmount" className="block text-sm font-medium text-gray-700 mb-2">
                                        Contribution Target Amount <span className="text-gray-500">(optional)</span>
                                      </label>
                                      <input
                                        type="text"
                                        id="targetAmount"
                                        value={targetAmount}
                                        onChange={(e) => setTargetAmount(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        placeholder="e.g., $10,000"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 6. Message Content */}
                              <div className="bg-gradient-to-r from-[#fff3e0] to-[#ffd9b3] rounded-xl p-6 border border-[#d97809]">
                                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                  <span className="mr-2">{scheduleType === "status" ? "3️⃣" : "6️⃣"}</span>
                                  <span className="mr-2">📨</span>
                                  {isFreeForm ? 'Free Form Message Block' : 'Message Content'}
                                </h4>
                                
                                <div>
                                  <label htmlFor="messageTemplate" className="block text-sm font-medium text-gray-700 mb-2">
                                    {isFreeForm ? 'Message Box' : 'Message Template'}
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
                                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent min-h-[150px]"
                                      placeholder={isFreeForm ? 
                                        "Type up to 12 unique messages separated by an asterisk *. These will be sent in order based on the schedule.\n\nExample:\nFirst message * Second message * Third message" :
                                        "Enter your message template. Use {days_left} to show remaining days.\n\nExample:\nDear members, we have {days_left} days left for our campaign..."
                                      }
                                      required
                                    />
                                    {isRecurring && recurrence && messageTemplate.includes('*') && (
                                      <div className="absolute right-3 bottom-3 text-xs text-gray-500 bg-white px-2 py-1 rounded border">
                                        {messageSequence.length} messages
                                      </div>
                                    )}
                                  </div>
                                  
                                  {isFreeForm && (
                                    <p className="mt-2 text-sm text-gray-600">
                                      💡 <strong>Tip:</strong> Use TRUEFAM&apos;s brand colors to enhance recognition and trust
                                    </p>
                                  )}
                                  
                                  {/* {days_left} Usage Note */}
                                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <p className="text-sm text-blue-800">
                                      <strong>📅 Dynamic Days Counter:</strong> Use <code className="bg-blue-100 px-1 py-0.5 rounded text-xs font-mono">{"{days_left}"}</code> anywhere in your message to automatically show the number of days remaining until the end date.
                                    </p>
                                    <p className="text-xs text-blue-600 mt-1">
                                      Example: &quot;Only {"{days_left}"} days left to reach our goal!&quot; → &quot;Only 15 days left to reach our goal!&quot;
                                    </p>
                                  </div>
                                  
                                  {sequenceError && (
                                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                      <p className="text-sm text-red-700">{sequenceError}</p>
                                    </div>
                                  )}
                                  
                                  {isRecurring && !sequenceError && messageTemplate.includes('*') && (
                                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                      <p className="text-sm text-blue-700">
                                        ✅ Separate multiple messages with an asterisk (*). Each message will be sent according to the recurrence pattern.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Media Upload */}
                              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-200">
                                <h5 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                                  <span className="mr-2">�</span>
                                  Media
                                </h5>
                                <MediaUpload
                                  media={media}
                                  onMediaChange={setMedia}
                                  maxFiles={isRecurring && messageSequence.length > 1 ? messageSequence.length : 1}
                                  isRecurring={isRecurring}
                                  recurrence={recurrence}
                                />
                              </div>

                              {/* Message Preview */}
                              {messageTemplate && messagePreview && (
                                scheduleType === "status" ? (
                                  <div className="flex flex-col items-center justify-center rounded-xl p-0 border border-blue-400 shadow-lg min-h-[480px] w-[320px] mx-auto relative" style={{background:'#C2A240'}}>
                                    {media && media.length > 0 && media[0]?.url ? (
                                      <>
                                        <div className="w-full h-[320px] flex items-center justify-center overflow-hidden rounded-t-xl">
                                          {media[0].type === 'video' ? (
                                            <video
                                              src={media[0].url}
                                              controls
                                              className="object-cover w-full h-full"
                                              style={{ maxHeight: 320 }}
                                            />
                                          ) : (
                                            <Image
                                              src={media[0].url}
                                              alt={`Status ${media[0].type}`}
                                              width={320}
                                              height={320}
                                              className="object-cover w-full h-full"
                                              style={{ maxHeight: 320 }}
                                            />
                                          )}
                                        </div>
                                        <div className="w-full px-4 py-4 flex items-center justify-center">
                                          <span className="text-lg font-semibold text-center text-white">
                                            {messagePreview}
                                          </span>
                                        </div>
                                      </>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center w-full h-full min-h-[480px]">
                                        <span className="text-2xl font-semibold text-center px-6 py-12 text-white">
                                          {messagePreview}
                                        </span>
                                      </div>
                                    )}
                                    <div className="w-full text-center py-2 text-xs text-gray-500 border-t border-blue-100">
                                      This preview is for representation only.
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl p-6 border border-gray-200">
                                    <h5 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                                      <span className="mr-2">👁️</span>
                                      Message Preview
                                    </h5>
                                    <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                                      <div className="whitespace-pre-wrap text-sm text-gray-700 font-mono leading-relaxed">
                                        {messagePreview}
                                      </div>
                                    </div>
                                  </div>
                                )
                              )}

                              {/* Submit Button */}
                              <div className="flex justify-end pt-4">
                                <button
                                  type="submit"
                                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-4 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg flex items-center space-x-2"
                                  disabled={
                                    (editingCampaign ? updateCampaign.isPending : createCampaign.isPending) || 
                                    !startDate || (!isRecurring ? false : !endDate) || !messageTemplate || 
                                    (isRecurring && !recurrence) ||
                                    (!editingCampaign && scheduleType == "message" && (!selectedAudienceIds.length || !selectedAudienceNames.length))
                                  }
                                >
                                  <span>
                                    {editingCampaign 
                                      ? (updateCampaign.isPending ? '⏳ Updating...' : '✏️ Update Campaign')
                                      : (createCampaign.isPending ? '⏳ Creating...' : '🚀 Schedule Messages')
                                    }
                                  </span>
                                </button>
                              </div>
                            </form>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-center mt-6 text-sm text-gray-500">
                  <span>Status: {sessionStatus ?? 'Initializing...'}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* TRUEFAM Footer */}
          <footer className="mt-8 text-center py-6 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              © <span id="year">{new Date().getFullYear()}</span> TRUEFAM Welfare LLC. All rights reserved.
            </div>
          </footer>
        </div>
      </main>
      
      <CompletedCampaignsModal
        isOpen={isCompletedCampaignsOpen}
        onClose={() => setIsCompletedCampaignsOpen(false)}
      />
    </div>
  );
}
