import { useEffect, useRef, useState } from 'react';
import { api } from "~/trpc/react";

interface AudienceSelectorProps {
  sessionName: string;
  onAudienceSelect: (audienceIds: string[], audienceNames: string[], audienceType: 'groups' | 'individuals') => void;
  selectedAudienceIds: string[];
  selectedAudienceType: 'groups' | 'individuals';
  onAudienceTypeChange: (type: 'groups' | 'individuals') => void;
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
  const [selectedGroupsState, setSelectedGroupsState] = useState<{id: string, name: string}[]>([]);
  const [selectedContactsState, setSelectedContactsState] = useState<{id: string, name: string, number?: string}[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Groups API
  const { 
    data: groupsData, 
    fetchNextPage: fetchNextGroupsPage, 
    hasNextPage: hasNextGroupsPage, 
    isFetchingNextPage: isFetchingNextGroupsPage, 
    isLoading: isLoadingGroups, 
    refetch: refetchGroups 
  } = api.user.getWhatsAppGroups.useInfiniteQuery({
    sessionName,
    limit: 10,
    search: searchQuery,
  }, {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled: false, // Don't fetch automatically - only when user searches
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    networkMode: 'always',
    meta: {
      priority: 'high'
    }
  });

  // Contacts API
  const { 
    data: contactsData, 
    fetchNextPage: fetchNextContactsPage, 
    hasNextPage: hasNextContactsPage, 
    isFetchingNextPage: isFetchingNextContactsPage, 
    isLoading: isLoadingContacts, 
    refetch: refetchContacts 
  } = api.user.getWhatsAppContacts.useInfiniteQuery({
    sessionName,
    limit: 50,
    search: searchQuery,
  }, {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled: false, // Don't fetch automatically - only when user searches
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    networkMode: 'always',
    meta: {
      priority: 'high'
    }
  });

  const allGroups = groupsData?.pages.flatMap(page => page.items) ?? [];
  const allContacts = contactsData?.pages.flatMap(page => page.items) ?? [];
  
  // Merge current search results with previously selected contacts
  const mergedContacts = [...allContacts];
  // Add previously selected contacts that are not in current search results
  selectedContactsState.forEach(selectedContact => {
    if (!allContacts.some(contact => contact.groupId === selectedContact.id)) {
      mergedContacts.unshift({
        groupId: selectedContact.id,
        groupName: selectedContact.name,
        number: selectedContact.number ?? '',
        isContact: true
      });
    }
  });
  
  // Get current selections for display
  const currentSelectedGroups = selectedAudienceType === 'groups' ? 
    allGroups.filter(g => selectedAudienceIds.includes(g.groupId)) : [];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleScroll = () => {
    if (!listRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop <= clientHeight * 1.2) {
      if (selectedAudienceType === 'groups' && hasNextGroupsPage && !isFetchingNextGroupsPage) {
        void fetchNextGroupsPage();
      } else if (selectedAudienceType === 'individuals' && hasNextContactsPage && !isFetchingNextContactsPage) {
        void fetchNextContactsPage();
      }
    }
  };

  const handleSearch = () => {
    if (isLoading) return; // Prevent multiple searches while loading
    
    if (selectedAudienceType === 'groups') {
      void refetchGroups();
    } else {
      void refetchContacts();
    }
  };

  const handleAudienceTypeChange = (type: 'groups' | 'individuals') => {
    onAudienceTypeChange(type);
    setSelectedGroupsState([]);
    setSelectedContactsState([]);
    setSearchQuery('');
    setIsOpen(false);
    // Clear parent component selections
    onAudienceSelect([], [], type);
  };

  const handleGroupSelect = (groupId: string, groupName: string) => {
    const group = allGroups.find(g => g.groupId === groupId);
    if (!group) return;
    
    const groupInfo = {
      id: groupId,
      name: groupName
    };
    
    let newSelectedGroups: {id: string, name: string}[];
    if (selectedGroupsState.some(g => g.id === groupId)) {
      // Remove from selection
      newSelectedGroups = selectedGroupsState.filter(g => g.id !== groupId);
    } else {
      // Add to selection (allow multiple groups)
      newSelectedGroups = [...selectedGroupsState, groupInfo];
    }
    
    setSelectedGroupsState(newSelectedGroups);
    onAudienceSelect(
      newSelectedGroups.map(g => g.id),
      newSelectedGroups.map(g => g.name),
      'groups'
    );
  };

  const handleContactSelect = (contactId: string, contactName: string) => {
    const contact = mergedContacts.find(c => c.groupId === contactId);
    if (!contact) return;
    
    const contactInfo = {
      id: contactId,
      name: contactName,
      number: contact.number
    };
    
    let newSelectedContacts: {id: string, name: string, number?: string}[];
    if (selectedContactsState.some(c => c.id === contactId)) {
      // Remove from selection
      newSelectedContacts = selectedContactsState.filter(c => c.id !== contactId);
    } else if (selectedContactsState.length < 15) {
      // Add to selection (max 15 contacts)
      newSelectedContacts = [...selectedContactsState, contactInfo];
    } else {
      // Max limit reached
      return;
    }
    
    setSelectedContactsState(newSelectedContacts);
    onAudienceSelect(
      newSelectedContacts.map(c => c.id),
      newSelectedContacts.map(c => c.name),
      'individuals'
    );
  };

  const handleConfirmSelection = () => {
    if (selectedAudienceType === 'groups' && selectedGroupsState.length > 0) {
      onAudienceSelect(
        selectedGroupsState.map(g => g.id),
        selectedGroupsState.map(g => g.name),
        'groups'
      );
      setIsOpen(false);
    } else if (selectedAudienceType === 'individuals' && selectedContactsState.length > 0) {
      onAudienceSelect(
        selectedContactsState.map(c => c.id),
        selectedContactsState.map(c => c.name),
        'individuals'
      );
      setIsOpen(false);
    }
  };

  const isLoading = selectedAudienceType === 'groups' ? isLoadingGroups : isLoadingContacts;

  return (
    <div className="space-y-4">
      {/* Audience Type Selection */}
      <div>
        <label htmlFor="audienceType" className="block text-sm font-medium text-gray-700 mb-2">
          Audience Type
        </label>
        <select
          id="audienceType"
          value={selectedAudienceType}
          onChange={(e) => handleAudienceTypeChange(e.target.value as 'groups' | 'individuals')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#008069]"
        >
          <option value="groups">Groups</option>
          <option value="individuals">Individuals</option>
        </select>
      </div>

      {/* Audience Selector */}
      <div className="relative" ref={dropdownRef}>
        <div className="flex flex-col space-y-2">
          <div 
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center justify-between w-full px-4 py-3 bg-white border border-gray-300 rounded-lg cursor-pointer hover:border-[#00a884] transition-colors ${isLoading ? 'opacity-75' : ''}`}
          >
            <div className="flex-1 truncate">
              {selectedAudienceType === 'groups' ? (
                currentSelectedGroups.length > 0 ? (
                  <span className="text-gray-900">
                    {currentSelectedGroups.length} group{currentSelectedGroups.length > 1 ? 's' : ''} selected
                  </span>
                ) : (
                  <span className="text-gray-500">Choose groups...</span>
                )
              ) : (
                selectedContactsState.length > 0 ? (
                  <span className="text-gray-900">
                    {selectedContactsState.length} contact{selectedContactsState.length > 1 ? 's' : ''} selected
                  </span>
                ) : (
                  <span className="text-gray-500">Choose contacts (max 15)...</span>
                )
              )}
            </div>
            <svg className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>

          {isOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200">
              <div className="p-2 border-b border-gray-200">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isLoading && searchQuery.trim()) {
                          handleSearch();
                        }
                      }}
                      placeholder={selectedAudienceType === 'groups' ? "Search groups..." : "Search contacts..."}
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
                  <button
                    onClick={handleSearch}
                    disabled={isLoading}
                    className="px-4 py-2 bg-[#00a884] text-white rounded-md hover:bg-[#008f6c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        <span>Searching...</span>
                      </>
                    ) : (
                      <>
                        <svg 
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span>Search</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div 
                ref={listRef}
                onScroll={handleScroll}
                className="max-h-[300px] overflow-y-auto overscroll-contain scroll-smooth"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex flex-col items-center space-y-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00a884]" />
                      <span className="text-sm text-gray-500">
                        {selectedAudienceType === 'groups' ? 'Searching groups...' : 'Searching contacts...'}
                      </span>
                    </div>
                  </div>
                ) : selectedAudienceType === 'groups' ? (
                  // Groups display
                  !groupsData ? (
                    <div className="py-6 px-4 text-center">
                      <svg 
                        className="mx-auto h-12 w-12 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900">Search for WhatsApp Groups</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Enter a search term and click search to find your WhatsApp groups
                      </p>
                    </div>
                  ) : allGroups.length === 0 ? (
                    <div className="py-3 px-4 text-sm text-gray-500 text-center">
                      No groups found matching your search
                    </div>
                  ) : (
                    <>
                      {allGroups.map((group, index) => (
                        <div
                          key={`group-${index}`}
                          onClick={() => handleGroupSelect(group.groupId, group.groupName)}
                          className={`px-4 py-3 cursor-pointer flex items-center space-x-3 ${
                            selectedGroupsState.some(g => g.id === group.groupId)
                              ? 'bg-[#e7f8f5] text-[#00a884]'
                              : 'hover:bg-gray-50 text-gray-900'
                          }`}
                        >
                          <div className="flex-shrink-0 w-8 h-8 bg-[#25D366] bg-opacity-10 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-[#00a884]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          <span className="flex-1 truncate text-sm">
                            {group.groupName}
                          </span>
                          {selectedGroupsState.some(g => g.id === group.groupId) && (
                            <svg className="w-5 h-5 text-[#00a884]" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      ))}
                      {isFetchingNextGroupsPage && (
                        <div className="flex items-center justify-center py-3">
                          <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#00a884]" />
                            <span className="text-sm text-gray-500">Loading more groups...</span>
                          </div>
                        </div>
                      )}
                      {selectedAudienceType === 'groups' && selectedGroupsState.length > 0 && (
                        <div className="p-4 border-t border-gray-200">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700">
                              {selectedGroupsState.length} group{selectedGroupsState.length > 1 ? 's' : ''} selected
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
                  )
                ) : (
                  // Contacts display
                  !contactsData ? (
                    <div className="py-6 px-4 text-center">
                      <svg 
                        className="mx-auto h-12 w-12 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900">Search for WhatsApp Contacts</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Enter a search term and click search to find your WhatsApp contacts
                      </p>
                    </div>
                  ) : mergedContacts.length === 0 ? (
                    <div className="py-3 px-4 text-sm text-gray-500 text-center">
                      No contacts found matching your search
                    </div>
                  ) : (
                    <>
                      {mergedContacts.map((contact, index) => (
                        <div
                          key={`contact-${index}`}
                          onClick={() => handleContactSelect(contact.groupId, contact.groupName)}
                          className={`px-4 py-3 cursor-pointer flex items-center space-x-3 ${
                            selectedContactsState.some(c => c.id === contact.groupId)
                              ? 'bg-[#e7f8f5] text-[#00a884]'
                              : 'hover:bg-gray-50 text-gray-900'
                          }`}
                        >
                          <div className="flex-shrink-0 w-8 h-8 bg-[#25D366] bg-opacity-10 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-[#00a884]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <span className="flex-1 truncate text-sm">
                            {contact.groupName}
                            {contact.number && (
                              <span className="text-xs text-gray-500 block">
                                {contact.number}
                              </span>
                            )}
                          </span>
                          {selectedContactsState.some(c => c.id === contact.groupId) && (
                            <svg className="w-5 h-5 text-[#00a884]" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      ))}
                      {isFetchingNextContactsPage && (
                        <div className="flex items-center justify-center py-3">
                          <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#00a884]" />
                            <span className="text-sm text-gray-500">Loading more contacts...</span>
                          </div>
                        </div>
                      )}
                      {selectedAudienceType === 'individuals' && selectedContactsState.length > 0 && (
                        <div className="p-4 border-t border-gray-200">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700">
                              {selectedContactsState.length}/15 contacts selected
                            </span>
                            <button
                              onClick={handleConfirmSelection}
                              className="px-3 py-1 bg-[#00a884] text-white text-sm rounded-md hover:bg-[#008f6c] transition-colors"
                            >
                              Confirm Selection
                            </button>
                          </div>
                          {selectedContactsState.length >= 15 && (
                            <p className="text-xs text-amber-600">
                              Maximum 15 contacts can be selected per message
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Selected Audience Display */}
      {selectedAudienceType === 'groups' && currentSelectedGroups.length > 0 && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 bg-[#00a884] rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-lg font-medium text-gray-900 truncate">
                {currentSelectedGroups.length} Group{currentSelectedGroups.length > 1 ? 's' : ''} Selected
              </h4>
              <p className="mt-1 text-sm text-gray-500">
                {currentSelectedGroups.slice(0, 3).map(g => g.groupName).join(', ')}
                {currentSelectedGroups.length > 3 && ` and ${currentSelectedGroups.length - 3} more`}
              </p>
            </div>
          </div>
        </div>
      )}

      {selectedAudienceType === 'individuals' && selectedContactsState.length > 0 && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 bg-[#00a884] rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-lg font-medium text-gray-900">
                {selectedContactsState.length} Contact{selectedContactsState.length > 1 ? 's' : ''} Selected
              </h4>
              <div className="mt-1 text-sm text-gray-500">
                {selectedContactsState.slice(0, 3).map(contact => contact.name).join(', ')}
                {selectedContactsState.length > 3 && ` and ${selectedContactsState.length - 3} more`}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
