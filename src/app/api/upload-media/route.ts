import { type NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { auth } from '~/server/auth';
import { headers } from 'next/headers';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB limit for WhatsApp

async function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  fileType: 'image' | 'video'
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const options = {
      folder,
      resource_type: fileType as "image" | "video" | "auto" | "raw",
      ...(fileType === 'image' ? {
        format: 'webp',
        quality: 'auto:best',
        transformation: [
          { width: 1200, height: 800, crop: 'limit' },
        ],
      } : {
        eager: [
          { format: 'mp4', transformation: [
            { width: 720, height: 1280, crop: 'limit' },
            { duration: 30 },
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
}

export async function POST(req: NextRequest) {
  try {
    // Get session using better-auth
    const heads = await headers();
    const session = await auth.api.getSession({
      headers: heads,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 });
    }

    // Get the form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!type || !['image', 'video'].includes(type)) {
      return NextResponse.json({ error: 'Invalid media type' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: 'File size exceeds 16MB limit' 
      }, { status: 400 });
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to Cloudinary
    const result = await uploadToCloudinary(buffer, 'whatsapp-campaigns', type as 'image' | 'video');

    return NextResponse.json({
      success: true,
      url: result.url,
      publicId: result.publicId
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ 
      error: 'Upload failed'
    }, { status: 500 });
  }
}
