import crypto from 'crypto';
import config from '../../config/index.js';

/**
 * Uploads a base64 encoded file to Cloudinary.
 * Supported file types: images and raw files (like PDF documents).
 * 
 * @param base64File - The base64 data URI string of the file (e.g. data:image/png;base64,...)
 * @returns The secure URL of the uploaded file on Cloudinary
 */
export const uploadToCloudinary = async (base64File: string): Promise<string> => {
  const cloudName = config.cloudinary_name;
  const apiKey = config.cloudinary_api_key;
  const apiSecret = config.cloudinary_api_secret;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials are not configured in environment variables');
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Generate Cloudinary SHA-1 signature. 
  // Sort all parameters (only timestamp here) alphabetically, append API secret.
  const signatureStr = `timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(signatureStr).digest('hex');

  // Prepare parameters as application/x-www-form-urlencoded
  const params = new URLSearchParams();
  params.append('file', base64File);
  params.append('api_key', apiKey);
  params.append('timestamp', timestamp);
  params.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await response.json() as any;

  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to upload to Cloudinary');
  }

  return data.secure_url;
};
