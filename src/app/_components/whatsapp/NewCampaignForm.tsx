import { type FormEvent } from 'react';

interface NewCampaignFormProps {
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
  messageTime: string;
  setMessageTime: (time: string) => void;
  messageTemplate: string;
  setMessageTemplate: (template: string) => void;
  messagePreview: string;
  isSubmitting: boolean;
  onSubmit: (e: FormEvent) => void;
}

export function NewCampaignForm({
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  messageTime,
  setMessageTime,
  messageTemplate,
  setMessageTemplate,
  messagePreview,
  isSubmitting,
  onSubmit,
}: NewCampaignFormProps) {
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
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
        disabled={isSubmitting || !startDate || !endDate || !messageTemplate}
      >
        {isSubmitting ? 'Creating Campaign...' : 'Schedule Messages'}
      </button>
    </form>
  );
}
