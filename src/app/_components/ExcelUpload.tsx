import { useState } from 'react';

export default function ExcelUpload() {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setMessage('');

    try {
      const response = await fetch('/api/upload-members', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`Successfully uploaded ${data.membersCreated} members`);
      } else {
        setMessage(data.error || 'Error uploading file');
      }
    } catch (error) {
      setMessage('Error uploading file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-4">
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
          <span className={message.includes('Success') ? 'text-green-600' : 'text-red-600'}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
