import { useEffect, useRef, useState } from 'react';
import { api } from "~/trpc/react";

interface GroupSelectorProps {
  sessionName: string;
  onGroupSelect: (groupId: string, groupName: string) => void;
  selectedGroupId: string | null;
}

export function GroupSelector({ sessionName, onGroupSelect, selectedGroupId }: GroupSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = 
    api.user.getWhatsAppGroups.useInfiniteQuery({
      sessionName,
      limit: 10,
      search: searchQuery,
    }, {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      networkMode: 'always',
      meta: {
        priority: 'high'
      }
    });

  const allGroups = data?.pages.flatMap(page => page.items) ?? [];
  const selectedGroup = allGroups.find(g => g.groupId === selectedGroupId);
  console.log('Selected Group:', selectedGroup);

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
    if (!listRef.current || !hasNextPage || isFetchingNextPage) return;

    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop <= clientHeight * 1.2) {
      void fetchNextPage();
    }
  };

  // Debounce search query with higher priority for search
  useEffect(() => {
    const searchTimer = setTimeout(() => {
      void refetch();
    }, searchQuery ? 150 : 300); // Faster search response, slower for empty queries

    return () => clearTimeout(searchTimer);
  }, [searchQuery, refetch]);

  // Performance monitoring for groups API
  const [loadTime, setLoadTime] = useState<number | null>(null);
  
  useEffect(() => {
    if (isLoading) {
      const startTime = performance.now();
      return () => {
        const endTime = performance.now();
        setLoadTime(endTime - startTime);
      };
    }
  }, [isLoading]);

  return (
    <div className="space-y-4">
      <div className="relative" ref={dropdownRef}>
        <div className="flex flex-col space-y-2">
          <div 
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center justify-between w-full px-4 py-3 bg-white border border-gray-300 rounded-lg cursor-pointer hover:border-[#00a884] transition-colors"
          >
            <div className="flex-1 truncate">
              {selectedGroup ? (
                <span className="text-gray-900">{selectedGroup.groupName}</span>
              ) : (
                <span className="text-gray-500">Choose a group...</span>
              )}
            </div>
            <svg className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>

          {isOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200">
              <div className="p-2 border-b border-gray-200">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search groups..."
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
                  {isLoading && (
                    <div className="absolute right-3 top-2.5">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#00a884]" />
                    </div>
                  )}
                  {process.env.NODE_ENV === 'development' && loadTime && (
                    <div className="absolute right-8 top-2.5 text-xs text-gray-500">
                      {Math.round(loadTime)}ms
                    </div>
                  )}
                </div>
              </div>
              <div 
                ref={listRef}
                onScroll={handleScroll}
                className="max-h-[300px] overflow-y-auto overscroll-contain scroll-smooth"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#00a884]" />
                  </div>
                ) : allGroups.length === 0 ? (
                  <div className="py-3 px-4 text-sm text-gray-500 text-center">
                    No groups found
                    {process.env.NODE_ENV === 'development' && loadTime && (
                      <div className="text-xs mt-1">Load time: {Math.round(loadTime)}ms</div>
                    )}
                  </div>
                ) : (
                  <>
                    {allGroups.map((group, index) => (
                      <div
                        key={`group-${index}`}
                        onClick={() => {
                          onGroupSelect(group.groupId, group.groupName);
                          setIsOpen(false);
                        }}
                        className={`px-4 py-3 cursor-pointer flex items-center space-x-3 ${
                          selectedGroupId === group.groupId
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
                      </div>
                    ))}
                    {isFetchingNextPage && (
                      <div className="flex items-center justify-center py-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#00a884]" />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedGroup && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 bg-[#00a884] rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-lg font-medium text-gray-900 truncate">{selectedGroup.groupName}</h4>
              <p className="mt-1 text-sm text-gray-500">ID: {selectedGroup.groupId}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
