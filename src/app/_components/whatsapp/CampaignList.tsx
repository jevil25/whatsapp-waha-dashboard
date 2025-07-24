import { api } from "~/trpc/react";
import { DateTime } from "luxon";
import { useState } from "react";
import ConfirmationModal from "../ConfirmationModal"

export interface Campaign {
  id: string;
  title?: string | null;
  targetAmount?: string | null;
  startDate: Date;
  endDate: Date;
  sendTimeUtc: string | Date;
  timeZone?: string;
  template: string;
  status: string;
  createdAt: Date;
  group: {
    id: string;
    groupName: string;
    groupId: string;
  };
  messages: Array<{
    id: string;
    content: string;
    scheduledAt: Date;
    sentAt?: Date | null;
    isSent: boolean;
    isFailed: boolean;
    hasImage?: boolean;
    imageUrl?: string | null;
    imagePublicId?: string | null;
  }>;
}

export interface Status {
  id: string;
  title?: string | null;
  startDate: Date;
  endDate: Date;
  sendTimeUtc: string | Date;
  timeZone?: string;
  template: string;
  status: string;
  createdAt: Date;
  statuses: Array<{
    id: string;
    content: string;
    scheduledAt: Date;
    sentAt?: Date | null;
    isSent: boolean;
    isFailed: boolean;
    hasImage?: boolean;
    imageUrl?: string | null;
    imagePublicId?: string | null;
  }>;
}

interface CampaignListProps {
  onEditCampaign: (campaign: Campaign) => void;
  onEditStatus: (status: Status) => void;
}

export function CampaignList({ onEditCampaign, onEditStatus }: CampaignListProps) {
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);
  const [statusToDelete, setStatusToDelete] = useState<string | null>(null);
  const { data, isLoading } = api.messageCampaign.getCampaigns.useQuery();
  const campaigns = data?.campaigns ?? [];
  const statuses = data?.statuses ?? [];

  const utils = api.useUtils();
  const deleteCampaign = api.messageCampaign.deleteCampaign.useMutation({
    onSuccess: () => {
      setCampaignToDelete(null);
      void utils.messageCampaign.getCampaigns.invalidate();
    },
  });
  const deleteStatus = api.messageCampaign.deleteStatus.useMutation({
    onSuccess: () => {
      setStatusToDelete(null);
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

  if (!campaigns.length && !statuses.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        No active campaigns or statuses found
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Campaigns */}
        {campaigns.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Message Campaigns</h3>
            {campaigns.map((campaign) => {
              const startDate = DateTime.fromJSDate(new Date(campaign.startDate));
              const endDate = DateTime.fromJSDate(new Date(campaign.endDate));
              const sentCount = campaign.messages.filter(m => m.isSent).length;
              const totalMessages = campaign.messages.length;
              const nextMessage = campaign.messages.find(m => !m.isSent);
              const nextScheduled = nextMessage ? DateTime.fromJSDate(new Date(nextMessage.scheduledAt)) : null;
              const progress = totalMessages > 0 ? (sentCount / totalMessages) * 100 : 0;

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
                    <div className="flex gap-2">
                      <button
                        onClick={() => onEditCampaign?.(campaign)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setCampaignToDelete(campaign.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                        disabled={deleteCampaign.isPending}
                      >
                        Delete
                      </button>
                    </div>
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
                    <div className="text-sm flex flex-col gap-1 text-gray-600 whitespace-pre-wrap border-t pt-2 mt-2">
                      <span className="text-gray-600">
                        Next message: {nextScheduled.toFormat('LLL dd, t ZZZZ')}
                      </span>
                      {campaign.timeZone && (
                        <span className="text-gray-600">
                          Scheduled time zone time: {nextScheduled.setZone(campaign.timeZone).toFormat('LLL dd, t ZZZZ')}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="text-sm text-gray-600 whitespace-pre-wrap border-t pt-2 mt-2">
                    <strong>Template:</strong> {campaign.template}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Statuses */}
        {statuses.length > 0 && (
          <div className={campaigns.length > 0 ? "pt-6" : ""}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Status Campaigns</h3>
            <div className="space-y-4">
              {statuses.map((statusCampaign) => {
                const startDate = DateTime.fromJSDate(new Date(statusCampaign.startDate));
                const endDate = DateTime.fromJSDate(new Date(statusCampaign.endDate));
                const sentCount = statusCampaign.statuses.filter(s => s.isSent).length;
                const totalStatuses = statusCampaign.statuses.length;
                const nextStatus = statusCampaign.statuses.find(s => !s.isSent);
                const nextScheduled = nextStatus ? DateTime.fromJSDate(new Date(nextStatus.scheduledAt)) : null;
                const progress = totalStatuses > 0 ? (sentCount / totalStatuses) * 100 : 0;

                return (
                  <div key={statusCampaign.id} className="bg-white border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        {statusCampaign.title && (
                          <h4 className="font-medium text-gray-900 mb-1">
                            {statusCampaign.title}
                          </h4>
                        )}
                        <h5 className={`${statusCampaign.title ? 'text-sm text-gray-600' : 'font-medium text-gray-900'}`}>
                          Status Campaign
                        </h5>
                        <p className="text-sm text-gray-500">
                          {startDate.toFormat('LLL dd')} - {endDate.toFormat('LLL dd, yyyy')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => onEditStatus?.(statusCampaign)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setStatusToDelete(statusCampaign.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                          disabled={deleteCampaign.isPending}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress: {sentCount} of {totalStatuses} statuses sent</span>
                        <span className="text-gray-500">{Math.round(progress)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                    </div>

                    {nextScheduled && (
                      <div className="text-sm flex flex-col gap-1 text-gray-600 whitespace-pre-wrap border-t pt-2 mt-2">
                        <span className="text-gray-600">
                          Next status: {nextScheduled.toFormat('LLL dd, t ZZZZ')}
                        </span>
                        {statusCampaign.timeZone && (
                          <span className="text-gray-600">
                            Scheduled time zone time: {nextScheduled.setZone(statusCampaign.timeZone).toFormat('LLL dd, t ZZZZ')}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="text-sm text-gray-600 whitespace-pre-wrap border-t pt-2 mt-2">
                      <strong>Template:</strong> {statusCampaign.template}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
      <ConfirmationModal
        isOpen={!!statusToDelete}
        onClose={() => setStatusToDelete(null)}
        onConfirm={() => {
          if (statusToDelete) {
            deleteStatus.mutate({ statusId: statusToDelete });
          }
        }}
        title="Delete Status"
        message="Are you sure you want to delete this status? This action cannot be undone."
        confirmText="Delete Status"
        cancelText="Cancel"
      />
    </>
  );
}