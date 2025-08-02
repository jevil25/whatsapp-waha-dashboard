// Migration helper functions

/**
 * Converts old image data format to new media format
 */
export function convertImagesToMedia(images?: Array<{ url: string; publicId: string; }>) {
  if (!images) return undefined;
  return images.map(img => ({
    ...img,
    type: 'image' as const
  }));
}

/**
 * Updates a message or status with media data (images or videos)
 */
export function addMediaToItem(
  item: {
    hasImage?: boolean;
    imageUrl?: string | null;
    imagePublicId?: string | null;
  },
  media?: Array<{ url: string; publicId: string; type: 'image' | 'video' }>,
  index = 0
) {
  if (!media?.length) {
    return {
      hasImage: false,
      imageUrl: null,
      imagePublicId: null,
      hasVideo: false,
      videoUrl: null,
      videoPublicId: null,
    };
  }

  const currentMedia = media[index % media.length];
  if (!currentMedia) {
    return {
      hasImage: false,
      imageUrl: null,
      imagePublicId: null,
      hasVideo: false,
      videoUrl: null,
      videoPublicId: null,
    };
  }
  
  if (currentMedia.type === 'video') {
    return {
      hasImage: false,
      imageUrl: null,
      imagePublicId: null,
      hasVideo: true,
      videoUrl: currentMedia.url,
      videoPublicId: currentMedia.publicId,
    };
  } else {
    return {
      hasImage: true,
      imageUrl: currentMedia.url,
      imagePublicId: currentMedia.publicId,
      hasVideo: false,
      videoUrl: null,
      videoPublicId: null,
    };
  }
}
