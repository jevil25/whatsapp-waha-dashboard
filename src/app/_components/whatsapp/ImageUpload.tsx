import { useState, useRef } from 'react';
import Image from 'next/image';

interface UploadedImage {
  url: string;
  publicId: string;
  file?: File;
}

interface ImageUploadProps {
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages: number;
  isRecurring: boolean;
  recurrence?: string;
}

interface UploadResponse {
  success: boolean;
  url: string;
  publicId: string;
  error?: string;
}

export function ImageUpload({ 
  images, 
  onImagesChange, 
  maxImages, 
  isRecurring, 
  recurrence 
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = maxImages - images.length;
    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    setUploading(true);

    try {
      const uploadPromises = filesToUpload.map(async (file) => {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('/api/upload-image', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = (await response.json()) as { error?: string };
          throw new Error(error.error ?? 'Upload failed');
        }

        const result = (await response.json()) as UploadResponse;
        return {
          url: result.url,
          publicId: result.publicId,
          file,
        };
      });

      const uploadedImages = await Promise.all(uploadPromises);
      onImagesChange([...images, ...uploadedImages]);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload images. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const getImageHelperText = () => {
    if (!isRecurring) {
      return 'Upload 1 image that will be sent with all messages.';
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
    
    if (maxImages === 1) {
      return 'Upload 1 image that will be used for all recurring messages.';
    }
    
    return `Upload up to ${maxImages} images. With ${recurrence?.toLowerCase()} recurrence (every ${days} day${days !== 1 ? 's' : ''}), different images will be used for each message cycle.`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-700">📸 Campaign Images</h4>
          <p className="text-xs text-gray-500 mt-1">
            {getImageHelperText()}
          </p>
        </div>
        
        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Uploading...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Image
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={maxImages > 1}
        onChange={handleFileSelect}
        className="hidden"
      />

      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((image, index) => (
            <div key={image.publicId} className="relative group">
              <Image
                src={image.url}
                alt={`Campaign image ${index + 1}`}
                width={200}
                height={128}
                className="w-full h-32 object-cover rounded-lg border border-gray-200"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(index)}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                {isRecurring && maxImages > 1 ? `Message ${index + 1}` : 'All messages'}
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length >= maxImages && (
        <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
          ⚠️ Maximum number of images reached ({maxImages}). Remove an image to add a new one.
        </div>
      )}
    </div>
  );
}
