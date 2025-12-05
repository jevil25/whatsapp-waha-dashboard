import { useEffect, useRef, useState } from 'react';
import { api } from "~/trpc/react";

type AudienceType = 'channels';

interface AudienceSelectorProps {
  sessionName: string;
  onAudienceSelect: (audienceIds: string[], audienceNames: string[], audienceType: AudienceType) => void;
  selectedAudienceIds: string[];
  selectedAudienceType: AudienceType;
  onAudienceTypeChange: (type: AudienceType) => void;
}

interface WhatsAppChannel {
  id: string;
  name: string;
  description?: string;
  invite?: string;
  picture?: string;
  verified: boolean;
  role: 'OWNER' | 'ADMIN' | 'SUBSCRIBER';
}

interface ChannelAudience {
  id: string;
  name: string;
  role?: string;
}

export function AudienceSelector({
  sessionName,
  onAudienceSelect,
  selectedAudienceIds,
  selectedAudienceType,
  onAudienceTypeChange
}: AudienceSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedChannelsState, setSelectedChannelsState] = useState<ChannelAudience[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Channels API - Fetch only OWNER and ADMIN channels (where user can send messages)
  const { 
    data: channelsData, 
    isLoading: isLoadingChannels,
    refetch: refetchChannels 
  } = api.user.getWhatsAppChannels.useQuery({
    sessionName,
  }, {
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    networkMode: 'always',
  });

  // Filter channels by search query and role (only OWNER or ADMIN can send messages)
  const allChannels = channelsData?.filter(channel => 
    channel.role === 'OWNER' || channel.role === 'ADMIN'
  ) ?? [];
  
  const filteredChannels = searchQuery.trim()
    ? allChannels.filter(channel =>
        channel.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        channel.description?.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : allChannels;

  // Get current selections for display
  const currentSelectedChannels = allChannels.filter(c => selectedAudienceIds.includes(c.id));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChannelSelect = (channelId: string, channelName: string, channelRole: string) => {
    const channel = allChannels.find(c => c.id === channelId);
    if (!channel) return;
    
    const channelInfo = {
      id: channelId,
      name: channelName,
      role: channelRole
    };
    
    let newSelectedChannels: ChannelAudience[];
    if (selectedChannelsState.some(c => c.id === channelId)) {
      // Remove from selection
      newSelectedChannels = selectedChannelsState.filter(c => c.id !== channelId);
    } else {
      // Add to selection (allow multiple channels)
      newSelectedChannels = [...selectedChannelsState, channelInfo];
    }
    
    setSelectedChannelsState(newSelectedChannels);
    onAudienceSelect(
      newSelectedChannels.map(c => c.id),
      newSelectedChannels.map(c => c.name),
      'channels'
    );
  };

  const handleConfirmSelection = () => {
    if (selectedChannelsState.length > 0) {
      onAudienceSelect(
        selectedChannelsState.map(c => c.id),
        selectedChannelsState.map(c => c.name),
        'channels'
      );
      setIsOpen(false);
    }
  };

  const isLoading = isLoadingChannels;

  return (
    <div className="space-y-4">
      {/* Channel Selector */}
      <div className="relative" ref={dropdownRef}>
        <div className="flex flex-col space-y-2">
          <label htmlFor="channelSelector" className="block text-sm font-medium text-gray-700">
            Select WhatsApp Channels
          </label>
          <div 
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center justify-between w-full px-4 py-3 bg-white border border-gray-300 rounded-lg cursor-pointer hover:border-[#00a884] transition-colors ${isLoading ? 'opacity-75' : ''}`}
          >
            <div className="flex-1 truncate">
              {currentSelectedChannels.length > 0 ? (
                <span className="text-gray-900">
                  {currentSelectedChannels.length} channel{currentSelectedChannels.length > 1 ? 's' : ''} selected
                </span>
              ) : (
                <span className="text-gray-500">Choose channels...</span>
              )}
            </div>
            <svg className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>

          {isOpen && (
            <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 max-h-96 overflow-hidden">
              {/* Search Bar */}
              <div className="p-3 border-b border-gray-200 bg-gray-50">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search channels..."
                    className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#00a884] focus:border-[#00a884]"
                  />
                  <svg 
                    className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="mt-2 text-xs text-gray-600">
                  💡 Only channels where you are OWNER or ADMIN are shown
                </p>
              </div>

              {/* Channels List */}
              <div 
                ref={listRef}
                className="overflow-y-auto max-h-80"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex flex-col items-center space-y-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00a884]" />
                      <span className="text-sm text-gray-500">Loading channels...</span>
                    </div>
                  </div>
                ) : !channelsData ? (
                  <div className="py-6 px-4 text-center">
                    <svg 
                      className="mx-auto h-12 w-12 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No Channels Available</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Create a channel on WhatsApp to get started
                    </p>
                  </div>
                ) : filteredChannels.length === 0 ? (
                  <div className="py-3 px-4 text-sm text-gray-500 text-center">
                    No channels found matching your search
                  </div>
                ) : (
                  <>
                    {filteredChannels.map((channel) => (
                      <div
                        key={channel.id}
                        onClick={() => handleChannelSelect(channel.id, channel.name, channel.role)}
                        className={`px-4 py-3 cursor-pointer flex items-center space-x-3 ${
                          selectedChannelsState.some(c => c.id === channel.id)
                            ? 'bg-[#e7f8f5] text-[#00a884]'
                            : 'hover:bg-gray-50 text-gray-900'
                        }`}
                      >
                        <div className="shrink-0 w-8 h-8 bg-[#25D366] bg-opacity-10 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-[#00a884]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="truncate text-sm font-medium">
                              {channel.name}
                            </span>
                            {channel.verified && (
                              <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            )}
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[#00a884] bg-opacity-10 text-[#00a884]">
                              {channel.role}
                            </span>
                          </div>
                          {channel.description && (
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {channel.description}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">
                            {channel.id}
                          </p>
                        </div>
                        {selectedChannelsState.some(c => c.id === channel.id) && (
                          <svg className="w-5 h-5 text-[#00a884]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    ))}
                    {selectedChannelsState.length > 0 && (
                      <div className="p-4 border-t border-gray-200">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium text-gray-700">
                            {selectedChannelsState.length} channel{selectedChannelsState.length > 1 ? 's' : ''} selected
                          </span>
                          <button
                            onClick={handleConfirmSelection}
                            className="px-3 py-1 bg-[#00a884] text-white text-sm rounded-md hover:bg-[#008f6c] transition-colors"
                          >
                            Confirm Selection
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Selected Channels Display */}
      {currentSelectedChannels.length > 0 && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 bg-[#00a884] rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-lg font-medium text-gray-900 truncate">
                {currentSelectedChannels.length} Channel{currentSelectedChannels.length > 1 ? 's' : ''} Selected
              </h4>
              <p className="mt-1 text-sm text-gray-500">
                {currentSelectedChannels.slice(0, 3).map(c => c.name).join(', ')}
                {currentSelectedChannels.length > 3 && ` and ${currentSelectedChannels.length - 3} more`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {currentSelectedChannels.map(channel => (
                  <span 
                    key={channel.id}
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#00a884] bg-opacity-10 text-[#00a884]"
                  >
                    {channel.name}
                    {channel.verified && (
                      <svg className="ml-1 w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
