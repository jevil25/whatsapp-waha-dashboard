import { useEffect, useState, type ChangeEvent } from 'react';
import { set } from 'zod';
import { api } from "~/trpc/react";

type ClubMember = {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  memoId: string;
  sheetEmail: string;
};

type CampaignMember = {
  memberId: string;
  campaignId: string;
  member: ClubMember;
};

type MemberSelectorProps = {
  members: readonly ClubMember[];
  campaignId: string;
  onMemberSelectionChange: (selectedMemberIds: readonly string[], sheetId?: string) => void;
  existingSelections?: readonly CampaignMember[];
  setSheetId: (sheetId: string) => void;
};

export function MemberSelector({ 
  members, 
  onMemberSelectionChange, 
  campaignId,
  existingSelections = [],
  setSheetId,
}: MemberSelectorProps) {
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(() => 
    new Set(existingSelections.length > 0 
      ? existingSelections.map(cm => cm.memberId) 
      : [])
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState('');

  const [validationStatus, setValidationStatus] = useState<'none' | 'success' | 'error'>('none');
  const [selectedGoogleAccount, setSelectedGoogleAccount] = useState<string>('');

  // Get unique Google accounts from members
  const uniqueGoogleAccounts = [...new Set(members.map(m => m.sheetEmail))].filter(Boolean);

  const validateSheetMutation = api.sheets.validateSheet.useMutation({
    onSuccess: (data: { sheetId: string }) => {
      setValidationError('');
      setValidationStatus('success');
      setValidating(false);
      if (selectedMemberIds.size > 0) {
        onMemberSelectionChange(Array.from(selectedMemberIds), data.sheetId);
      }
      setSheetId(data.sheetId);
    },
    onError: (error) => {
      setValidationError(error.message);
      setValidationStatus('error');
      setValidating(false);
    }
  });

  useEffect(() => {
    if (existingSelections.length > 0) {
      setSelectedMemberIds(new Set(existingSelections.map(cm => cm.memberId)));
      
      // Set the Google account from the first existing selection
      const firstSelection = existingSelections[0];
      if (firstSelection) {
        const firstMember = members.find(m => m.id === firstSelection.memberId);
        if (firstMember?.sheetEmail) {
          setSelectedGoogleAccount(firstMember.sheetEmail);
        }
      }
    }
  }, [existingSelections, members]);

  const handleSelectAll = () => {
    if (!selectedGoogleAccount) {
      setValidationError('Please select a Google account first');
      return;
    }
    
    const eligibleMembers = members.filter(m => m.sheetEmail === selectedGoogleAccount);
    const allMemberIds = new Set<string>(eligibleMembers.map(m => m.id));
    setSelectedMemberIds(allMemberIds);
    onMemberSelectionChange(Array.from(allMemberIds));
  };

  const handleDeselectAll = () => {
    setSelectedMemberIds(new Set<string>());
    onMemberSelectionChange([]);
  };

  const handleSheetValidation = async (selectedIds: Set<string>) => {
    if (selectedIds.size === 0) return;
    
    if (!selectedGoogleAccount) {
      setValidationError('Please select a Google account first');
      return;
    }

    setValidating(true);
    validateSheetMutation.mutate({
      sheetInput: sheetUrl,
      selectedAccount: selectedGoogleAccount
    });
  };

  const handleMemberToggle = (memberId: string): void => {
    const newSelectedIds = new Set<string>(selectedMemberIds);
    const member = members.find(m => m.id === memberId);
    
    if (!member) return;

    if (newSelectedIds.has(memberId)) {
      newSelectedIds.delete(memberId);
      setSelectedMemberIds(newSelectedIds);
      onMemberSelectionChange(Array.from(newSelectedIds));
    } else {
      if (selectedGoogleAccount && member.sheetEmail !== selectedGoogleAccount) {
        setValidationError('Selected member uses a different Google account');
        return;
      }

      newSelectedIds.add(memberId);
      setSelectedMemberIds(newSelectedIds);
      
      // If no Google account is selected yet, set it to this member's account
      if (!selectedGoogleAccount && member.sheetEmail) {
        setSelectedGoogleAccount(member.sheetEmail);
      }

      // If sheet URL is already validated, pass along the sheetId
      if (sheetUrl && !validationError) {
        handleSheetValidation(newSelectedIds);
      } else {
        onMemberSelectionChange(Array.from(newSelectedIds));
      }
    }
  };

  const filteredMembers = members.filter(member => {
    // First filter by selected Google account if one is selected
    if (selectedGoogleAccount && member.sheetEmail !== selectedGoogleAccount) {
      return false;
    }
    
    // Then filter by search term
    return `${member.firstName} ${member.lastName} ${member.sheetEmail} ${member.memoId}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col space-y-4">
        {/* Google Account Selection */}
        <div>
          <label htmlFor="googleAccount" className="block text-sm font-medium text-gray-700 mb-1">
            Google Account
          </label>
          <select
            id="googleAccount"
            value={selectedGoogleAccount}
            onChange={(e) => {
              setSelectedGoogleAccount(e.target.value);
              setSelectedMemberIds(new Set());
              onMemberSelectionChange([]);
              setValidationStatus('none');
              setValidationError('');
            }}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select Google Account</option>
            {uniqueGoogleAccounts.map(email => (
              <option key={email} value={email}>{email}</option>
            ))}
          </select>
        </div>

        {/* Google Sheet URL */}
        <div>
          <label htmlFor="sheetUrl" className="block text-sm font-medium text-gray-700 mb-1">
            Google Sheet URL
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              id="sheetUrl"
              value={sheetUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setSheetUrl(e.target.value);
                setValidationError('');
                setValidationStatus('none');
              }}
              placeholder="Enter Google Sheet URL"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={() => handleSheetValidation(selectedMemberIds)}
              disabled={validating || selectedMemberIds.size === 0 || !sheetUrl}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {validating ? 'Validating...' : 'Validate'}
            </button>
          </div>
          {validationStatus === 'error' && (
            <p className="mt-1 text-sm text-red-600">{validationError}</p>
          )}
          {validationStatus === 'success' && (
            <p className="mt-1 text-sm text-green-600">Sheet validated successfully!</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex space-x-2">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1 text-sm rounded-md bg-green-100 text-green-800 hover:bg-green-200"
            >
              Select All
            </button>
            <button
              onClick={handleDeselectAll}
              className="px-3 py-1 text-sm rounded-md bg-red-100 text-red-800 hover:bg-red-200"
            >
              Deselect All
            </button>
          </div>
          <div>
            <input
              type="text"
              placeholder="Search members..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="px-3 py-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#d97809]"
            />
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto border rounded-md">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Select
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sheet Email
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMembers.map((member) => (
                <tr key={member.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.has(member.id)}
                      onChange={() => handleMemberToggle(member.id)}
                      className="h-4 w-4 text-[#d97809] focus:ring-[#d97809] border-gray-300 rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {member.firstName} {member.lastName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {member.sheetEmail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="text-sm text-gray-500">
          {selectedMemberIds.size} of {members.length} members selected
        </div>
      </div>
    </div>
  );
}
