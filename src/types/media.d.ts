export interface UploadedMedia {
  url: string;
  publicId: string;
  type: 'image' | 'video';
  file?: File;
}

export interface MediaMetadata {
  url: string;
  publicId: string;
  type: 'image' | 'video';
}
