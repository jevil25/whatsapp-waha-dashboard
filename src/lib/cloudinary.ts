import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary with type-safe environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export default cloudinary;

export const uploadToCloudinary = async (
  buffer: Buffer,
  folder = 'whatsapp-campaigns',
  fileType: 'image' | 'video' = 'image'
): Promise<{ url: string; publicId: string }> => {
  return new Promise((resolve, reject) => {
    const options = {
      folder,
      resource_type: fileType as "image" | "video" | "auto" | "raw",
      ...(fileType === 'image' ? {
        format: 'webp', // Convert to WebP for better compression
        quality: 'auto:best', // Automatic quality optimization
        transformation: [
          { width: 1200, height: 800, crop: 'limit' }, // Limit size for WhatsApp
        ],
      } : {
        eager: [
          { format: 'mp4', transformation: [
            { width: 720, height: 1280, crop: 'limit' }, // Portrait format for WhatsApp status
            { duration: 30 }, // Limit to 30 seconds for WhatsApp
          ]},
        ],
      })
    };
    
    cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) {
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else if (result) {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        } else {
          reject(new Error('Upload failed'));
        }
      }
    ).end(buffer);
  });
};

export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    // Don't throw error as it's not critical for the app to continue
  }
};
