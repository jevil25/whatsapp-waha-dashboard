import { useEffect, useState } from 'react';
import { api } from "~/trpc/react";

type ClubMember = {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  memoId: string;
};

type CampaignMember = {
  memberId: string;
  campaignId: string;
  member: ClubMember;
};

type MemberSelectorProps = {
  members: readonly ClubMember[];
  campaignId: string;
  onMemberSelectionChange: (selectedMemberIds: readonly string[]) => void;
  existingSelections?: readonly CampaignMember[];
};

export function MemberSelector({ 
  members, 
  onMemberSelectionChange, 
  campaignId,
  existingSelections = []
}: MemberSelectorProps) {
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(() => 
    new Set(existingSelections.length > 0 
      ? existingSelections.map(cm => cm.memberId) 
      : [])
  );
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (existingSelections.length > 0) {
      setSelectedMemberIds(new Set(existingSelections.map(cm => cm.memberId)));
    }
  }, [existingSelections]);

  const handleSelectAll = () => {
    const allMemberIds = new Set<string>(members.map(m => m.id));
    setSelectedMemberIds(allMemberIds);
    onMemberSelectionChange(Array.from(allMemberIds));
  };

  const handleDeselectAll = () => {
    setSelectedMemberIds(new Set<string>());
    onMemberSelectionChange([]);
  };

  const handleMemberToggle = (memberId: string): void => {
    const newSelectedIds = new Set<string>(selectedMemberIds);
    if (newSelectedIds.has(memberId)) {
      newSelectedIds.delete(memberId);
    } else {
      newSelectedIds.add(memberId);
    }
    setSelectedMemberIds(newSelectedIds);
    onMemberSelectionChange(Array.from(newSelectedIds));
  };

  const filteredMembers = members.filter(member =>
    `${member.firstName} ${member.lastName} ${member.phoneNumber} ${member.memoId}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
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
        <input
          type="text"
          placeholder="Search members..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-3 py-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#d97809]"
        />
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
                Phone Number
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
                  {member.phoneNumber}
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
  );
}
