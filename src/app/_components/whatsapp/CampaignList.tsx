/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { api } from "~/trpc/react";
import { DateTime } from "luxon";
import { useState } from "react";
import ConfirmationModal from "../ConfirmationModal"

export function CampaignList() {
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);
  const { data: campaigns, isLoading } = api.messageCampaign.getCampaigns.useQuery();

  const utils = api.useUtils();
  const deleteCampaign = api.messageCampaign.deleteCampaign.useMutation({
    onSuccess: () => {
      setCampaignToDelete(null);
      void utils.messageCampaign.getCampaigns.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-20 bg-gray-100 rounded"></div>
        <div className="h-20 bg-gray-100 rounded"></div>
      </div>
    );
  }

  if (!campaigns?.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        No active campaigns found
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {campaigns.map((campaign) => {
          const startDate = DateTime.fromJSDate(new Date(campaign.startDate));
          const endDate = DateTime.fromJSDate(new Date(campaign.endDate));
          const sentCount = campaign.messages.filter(m => m.isSent).length;
          const totalMessages = campaign.messages.length;
          const nextMessage = campaign.messages.find(m => !m.isSent);
          const nextScheduled = nextMessage ? DateTime.fromJSDate(new Date(nextMessage.scheduledAt)) : null;
          const progress = (sentCount / totalMessages) * 100;

          return (
            <div key={campaign.id} className="bg-white border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  {campaign.title && (
                    <h4 className="font-medium text-gray-900 mb-1">
                      {campaign.title}
                    </h4>
                  )}
                  <h5 className={`${campaign.title ? 'text-sm text-gray-600' : 'font-medium text-gray-900'}`}>
                    {campaign.group.groupName}
                  </h5>
                  <p className="text-sm text-gray-500">
                    {startDate.toFormat('LLL dd')} - {endDate.toFormat('LLL dd, yyyy')}
                  </p>
                  {campaign.targetAmount && (
                    <p className="text-sm text-blue-600 font-medium">
                      Target: {campaign.targetAmount}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setCampaignToDelete(campaign.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                  disabled={deleteCampaign.isPending}
                >
                  Delete
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress: {sentCount} of {totalMessages} messages sent</span>
                  <span className="text-gray-500">{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-green-600 h-2.5 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>

              {nextScheduled && (
                <div className="text-sm">
                  <span className="text-gray-600">
                    Next message: {nextScheduled.setZone('America/Chicago').toFormat('LLL dd, t ZZZZ')}
                  </span>
                </div>
              )}

              <div className="text-sm text-gray-600 whitespace-pre-wrap border-t pt-2 mt-2">
                <strong>Template:</strong> {campaign.template}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmationModal
        isOpen={!!campaignToDelete}
        onClose={() => setCampaignToDelete(null)}
        onConfirm={() => {
          if (campaignToDelete) {
            deleteCampaign.mutate({ campaignId: campaignToDelete });
          }
        }}
        title="Delete Campaign"
        message="Are you sure you want to delete this campaign? This action cannot be undone."
        confirmText="Delete Campaign"
        cancelText="Cancel"
      />
    </>
  );
}
