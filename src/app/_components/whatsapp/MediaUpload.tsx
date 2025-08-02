import { useState, useRef } from 'react';
import Image from 'next/image';

interface UploadedMedia {
  url: string;
  publicId: string;
  type: 'image' | 'video';
  file?: File;
}

interface MediaUploadProps {
  media: UploadedMedia[];
  onMediaChange: (media: UploadedMedia[]) => void;
  maxFiles: number;
  isRecurring: boolean;
  recurrence?: string;
}

interface UploadResponse {
  success: boolean;
  url: string;
  publicId: string;
  error?: string;
}

export function MediaUpload({ 
  media, 
  onMediaChange, 
  maxFiles, 
  isRecurring, 
  recurrence 
}: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = maxFiles - media.length;
    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    setUploading(true);

    try {
      const uploadPromises = filesToUpload.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', file.type.startsWith('video/') ? 'video' : 'image');

        const response = await fetch('/api/upload-media', {
          method: 'POST',
          body: formData,
          credentials: 'include', // Include cookies in the request
        });

        if (!response.ok) {
          const error = (await response.json()) as { error?: string };
          throw new Error(error.error ?? 'Upload failed');
        }

        const result = (await response.json()) as UploadResponse;
        return {
          url: result.url,
          publicId: result.publicId,
          type: file.type.startsWith('video/') ? 'video' : 'image' as 'image' | 'video',
          file,
        };
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      onMediaChange([...media, ...uploadedFiles]);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload media. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveMedia = (index: number) => {
    const newMedia = media.filter((_, i) => i !== index);
    onMediaChange(newMedia);
  };

  const getMediaHelperText = () => {
    if (!isRecurring) {
      return 'Upload 1 image or video that will be sent with all messages.';
    }
    
    const recurrenceMap: Record<string, number> = {
      'DAILY': 1,
      'WEEKLY': 7,
      'SEMI_MONTHLY': 15,
      'MONTHLY': 30,
      'SEMI_ANNUALLY': 182,
      'ANNUALLY': 365
    };

    const days = recurrence ? recurrenceMap[recurrence] : 1;
    return `Upload up to ${days} images or videos. Each one will be used for a different message in the sequence.`;
  };

  return (
    <div className="mt-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Media Upload {uploading && <span className="text-orange-600 ml-2">Uploading...</span>}
      </label>
      
      <div className="flex flex-wrap gap-4 mb-4">
        {media.map((item, index) => (
          <div key={index} className="relative">
            {item.type === 'image' ? (
              <Image
                src={item.url}
                alt={`Uploaded ${index + 1}`}
                width={100}
                height={100}
                className="object-cover rounded-lg"
              />
            ) : (
              <video
                src={item.url}
                className="w-[100px] h-[100px] object-cover rounded-lg"
                controls
              />
            )}
            <button
              onClick={() => handleRemoveMedia(index)}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {media.length < maxFiles && (
        <div className="mt-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileSelect}
            multiple={isRecurring}
            disabled={uploading}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-orange-50 file:text-orange-700
              hover:file:bg-orange-100
            "
          />
          <p className="mt-2 text-sm text-gray-500">
            {getMediaHelperText()}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Supported formats: JPG, PNG, GIF, MP4, WebM (max 16MB for videos)
          </p>
        </div>
      )}
    </div>
  );
}
