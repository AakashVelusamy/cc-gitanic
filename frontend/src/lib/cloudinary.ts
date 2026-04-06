interface CloudinaryUploadResponse {
  secure_url?: string;
  error?: {
    message?: string;
  };
}

export async function uploadAvatarToCloudinary(file: File): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Cloudinary is not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET.'
    );
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', 'gitanic/avatars');

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  const data = (await response.json()) as CloudinaryUploadResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to upload image to Cloudinary');
  }

  if (!data.secure_url) {
    throw new Error('Cloudinary upload succeeded but no secure_url was returned');
  }

  return data.secure_url;
}
