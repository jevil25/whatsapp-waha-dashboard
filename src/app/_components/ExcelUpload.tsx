import { useState, useEffect } from 'react';

interface ExcelUploadProps {
  onSuccess?: () => void;
}

export default function ExcelUpload({ onSuccess }: ExcelUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [googleAccounts, setGoogleAccounts] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');

  useEffect(() => {
    const fetchGoogleAccounts = async () => {
      try {
        const response = await fetch('/api/google-accounts');
        const data = await response.json();
        
        if (data.success) {
          setGoogleAccounts(data.accounts);
          if (data.accounts.length > 0) {
            setSelectedAccount(data.accounts[0]);
          }
        }
      } catch (error) {
        console.error('Error fetching Google accounts:', error);
      }
    };

    fetchGoogleAccounts();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedAccount) {
      setMessage('Please select a Google account');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('googleAccount', selectedAccount);

    setUploading(true);
    setMessage('');

    try {
      const response = await fetch('/api/upload-members', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('Members imported successfully');
        onSuccess?.();
      } else {
        const error = await response.text();
        setMessage(`Error: ${error}`);
      }
    } catch (error) {
      setMessage('Error uploading file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="block w-64 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={uploading}
            aria-describedby="email-description"
          >
            {googleAccounts.map((account) => (
              <option key={account} value={account}>
                {account}
              </option>
            ))}
          </select>
        </div>
        <p id="email-description" className="text-sm text-gray-500">
          Select the Google account that will be used to lookup payment records from the sheets
        </p>
      </div>
      <div className="flex items-center gap-4">
        <label
          htmlFor="excel-upload"
          className="cursor-pointer inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {uploading ? 'Uploading...' : 'Upload Excel'}
          <input
            id="excel-upload"
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
        {message && (
          <div className={`whitespace-pre-wrap ${message.includes('successfully') ? 'text-green-600' : 'text-red-600'}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
