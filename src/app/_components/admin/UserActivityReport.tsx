import { useState } from 'react';
import { api } from "~/trpc/react";

import type { UserActivity, MonthlyBreakdown } from "~/types/userActivity";

export function UserActivityReport() {
  const [startMonth, setStartMonth] = useState<number>(new Date().getMonth() + 1);
  const [startYear, setStartYear] = useState<number>(new Date().getFullYear());
  const [endMonth, setEndMonth] = useState<number>(new Date().getMonth() + 1);
  const [endYear, setEndYear] = useState<number>(new Date().getFullYear());
  const [modalUser, setModalUser] = useState<UserActivity | null>(null);

  // Updated to send complete date range
  const { data: activityData, isLoading } = api.userActivity.getUserActivityReport.useQuery({
    startMonth,
    startYear,
    endMonth,
    endYear,
  }) as { data: UserActivity[] | undefined, isLoading: boolean };

  const generateMonthOptions = () => {
    const months = [
      { value: 1, label: 'January' },
      { value: 2, label: 'February' },
      { value: 3, label: 'March' },
      { value: 4, label: 'April' },
      { value: 5, label: 'May' },
      { value: 6, label: 'June' },
      { value: 7, label: 'July' },
      { value: 8, label: 'August' },
      { value: 9, label: 'September' },
      { value: 10, label: 'October' },
      { value: 11, label: 'November' },
      { value: 12, label: 'December' },
    ];

    return months;
  };

  const generateYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear; year >= currentYear - 2; year--) {
      years.push(year);
    }
    return years;
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function isMonthInRange(month: number, year: number) {
    const start = startYear * 100 + startMonth;
    const end = endYear * 100 + endMonth;
    const value = year * 100 + month;
    return value >= start && value <= end;
  }

  const generateReportContent = (userData: UserActivity) => {
    let content = `User Activity Report\n`;
    content += `===================\n\n`;
    content += `User: ${userData.userName}\n`;
    content += `Email: ${userData.email}\n`;
    content += `Total Groups Connected: ${userData.totalGroups}\n`;
    content += `Total Messages Scheduled: ${userData.totalMessages}\n\n`;
    content += `Summary (${monthNames[startMonth-1]} ${startYear} - ${monthNames[endMonth-1]} ${endYear}):\n`;
    content += `------------------\n`;

    userData.monthlyBreakdown
      .filter(m => isMonthInRange(m.month, m.year))
      .forEach(month => {
        content += `${monthNames[month.month - 1]} ${month.year}: `;
        content += `${month.groupsConnected} groups, ${month.messagesScheduled} messages\n`;
      });

    return content;
  };

  const handleDownloadReport = (userId: string) => {
    const userData = activityData?.find(user => user.userId === userId);
    if (!userData) {
      console.error('Failed to find user data for report');
      return;
    }

    const content = generateReportContent(userData);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-report-${userData.userName.toLowerCase().replace(/\s+/g, '-')}-${monthNames[startMonth-1]}-${startYear}_to_${monthNames[endMonth-1]}-${endYear}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const sendReport = api.userActivity.sendActivityReport.useMutation();
  const [sendingUserId, setSendingUserId] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<{ [userId: string]: 'sent' | 'failed' | null }>({});

  const handleSendReport = async (userId: string) => {
    const userData = activityData?.find(user => user.userId === userId);
    if (!userData) {
      console.error('Failed to find user data for report');
      return;
    }

    setSendingUserId(userId);
    setSendStatus((prev) => ({ ...prev, [userId]: null }));
    try {
      await sendReport.mutateAsync({
        userId,
        year: endYear,
        startMonth,
        startYear,
        endMonth,
        endYear,
        summary: userData,
      });
      setSendStatus((prev) => ({ ...prev, [userId]: 'sent' }));
      // Optionally reset after a delay
      setTimeout(() => setSendStatus((prev) => ({ ...prev, [userId]: null })), 3000);
    } catch (error) {
      setSendStatus((prev) => ({ ...prev, [userId]: 'failed' }));
      setTimeout(() => setSendStatus((prev) => ({ ...prev, [userId]: null })), 3000);
    } finally {
      setSendingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">User Activity Report</h2>
        <div className="flex gap-2 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500">Start Month</label>
            <select value={startMonth} onChange={e => setStartMonth(parseInt(e.target.value))} className="rounded-md border-gray-300 shadow-sm">
              {generateMonthOptions().map(month => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">Start Year</label>
            <select value={startYear} onChange={e => setStartYear(parseInt(e.target.value))} className="rounded-md border-gray-300 shadow-sm">
              {generateYearOptions().map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">End Month</label>
            <select value={endMonth} onChange={e => setEndMonth(parseInt(e.target.value))} className="rounded-md border-gray-300 shadow-sm">
              {generateMonthOptions().map(month => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500">End Year</label>
            <select value={endYear} onChange={e => setEndYear(parseInt(e.target.value))} className="rounded-md border-gray-300 shadow-sm">
              {generateYearOptions().map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00a884]" />
        </div>
      ) : !activityData || activityData.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No activity data available for the selected period.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active Groups w/ Scheduled Messages</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Messages (incl. Status Updates)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {activityData.map((user) => (
                <tr key={user.userId}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{user.userName}</div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.activeGroupsWithScheduledMessages}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.totalMessages}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-4">
                      <button
                        onClick={() => setModalUser(user)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => handleDownloadReport(user.userId)}
                        className="text-[#00a884] hover:text-[#008f6c] font-medium"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => handleSendReport(user.userId)}
                        className={`text-[#00a884] hover:text-[#008f6c] font-medium ${sendingUserId === user.userId ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={sendingUserId === user.userId}
                      >
                        {sendingUserId === user.userId
                          ? 'Sending...'
                          : sendStatus[user.userId] === 'sent'
                          ? 'Sent!'
                          : sendStatus[user.userId] === 'failed'
                          ? 'Failed'
                          : 'Send Report'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(240, 240, 240, 0.85)" }}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full relative">
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-xl"
              onClick={() => setModalUser(null)}
              aria-label="Close"
            >
              &times;
            </button>
            <h3 className="text-xl font-bold mb-2">Monthly Breakdown for {modalUser.userName}</h3>
            <div className="mb-4 text-sm text-gray-600">{modalUser.email}</div>
            <div className="mb-2 text-sm text-gray-700">
              <strong>Active Groups w/ Scheduled Messages:</strong> {modalUser.activeGroupsWithScheduledMessages}
              <span className="text-gray-400 ml-1" title="Counts unique groups with at least one scheduled message during the period.">?</span>
            </div>
            <div className="mb-2 text-sm text-gray-700">
              <strong>Total Messages (incl. Status Updates):</strong> {modalUser.totalMessages}
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {modalUser.monthlyBreakdown.filter(m => isMonthInRange(m.month, m.year)).length === 0 ? (
                <div className="text-gray-500">No details available for selected range.</div>
              ) : (
                modalUser.monthlyBreakdown
                  .filter(m => isMonthInRange(m.month, m.year))
                  .map((breakdown) => (
                    <div key={`${breakdown.month}-${breakdown.year}`} className="border-b pb-2">
                      <span className="font-medium">{monthNames[breakdown.month - 1]} {breakdown.year}:</span> {breakdown.groupsConnected} groups, {breakdown.messagesScheduled} messages
                    </div>
                  ))
              )}
            </div>
            <div className="flex gap-4 mt-6">
              <button
                onClick={() => handleDownloadReport(modalUser.userId)}
                className="px-4 py-2 bg-[#00a884] text-white rounded hover:bg-[#008f6c]"
                disabled={modalUser.monthlyBreakdown.filter(m => isMonthInRange(m.month, m.year)).length === 0}
              >
                Download
              </button>
              <button
                onClick={() => handleSendReport(modalUser.userId)}
                className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-800 ${sendingUserId === modalUser.userId ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={modalUser.monthlyBreakdown.filter(m => isMonthInRange(m.month, m.year)).length === 0 || sendingUserId === modalUser.userId}
              >
                {sendingUserId === modalUser.userId
                  ? 'Sending...'
                  : sendStatus[modalUser.userId] === 'sent'
                  ? 'Sent!'
                  : sendStatus[modalUser.userId] === 'failed'
                  ? 'Failed'
                  : 'Send Report'}
              </button>
              <button
                onClick={() => setModalUser(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}