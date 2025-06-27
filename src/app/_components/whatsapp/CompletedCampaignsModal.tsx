import { useState } from 'react';
import { api } from "~/trpc/react";
import { DateTime } from "luxon";

export function CompletedCampaignsModal({ isOpen, onClose }: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data: campaigns, isLoading } = api.messageCampaign.getCompletedCampaigns.useQuery();
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredCampaigns = campaigns?.filter(campaign => 
    campaign.group.groupName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    campaign.template.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col pointer-events-auto">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-medium">Completed Campaigns</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4 border-b">
            <input
              type="text"
              placeholder="Search by group name or message template..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-auto p-4">
            {isLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-20 bg-gray-100 rounded"></div>
                <div className="h-20 bg-gray-100 rounded"></div>
              </div>
            ) : !filteredCampaigns?.length ? (
              <div className="text-center py-8 text-gray-500">
                No completed campaigns found
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCampaigns.map((campaign) => {
                  const startDate = DateTime.fromJSDate(new Date(campaign.startDate));
                  const endDate = DateTime.fromJSDate(new Date(campaign.endDate));
                  const sentCount = campaign.messages.filter(m => m.isSent).length;
                  const totalMessages = campaign.messages.length;

                  return (
                    <div key={campaign.id} className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {campaign.group.groupName}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {startDate.toFormat('LLL dd')} - {endDate.toFormat('LLL dd, yyyy')}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Final Status: {sentCount} of {totalMessages} messages sent</span>
                          <span className="text-gray-500">
                            {Math.round((sentCount / totalMessages) * 100)}% Complete
                          </span>
                        </div>
                      </div>

                      <div className="text-sm text-gray-600 whitespace-pre-wrap border-t pt-2 mt-2">
                        <strong>Template:</strong> {campaign.template}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
