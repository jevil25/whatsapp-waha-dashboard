import { type NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

async function uploadToCloudinary(
  buffer: Buffer,
  folder = 'whatsapp-campaigns'
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const options = {
      folder,
      resource_type: 'image' as const,
      format: 'webp',
      quality: 'auto:best',
      transformation: [
        { width: 1200, height: 800, crop: 'limit' },
      ],
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
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Cloudinary
    const { url, publicId } = await uploadToCloudinary(buffer);

    return NextResponse.json({
      success: true,
      url,
      publicId,
    });
  } catch (error) {
    console.error('Image upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}

// Set config to handle larger files
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
