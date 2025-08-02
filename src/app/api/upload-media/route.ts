/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { type NextRequest, NextResponse } from 'next/server';
import { uploadToCloudinary } from '../../../lib/cloudinary';
import { auth } from '~/server/auth';
import { headers } from 'next/headers';

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB limit for WhatsApp

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
