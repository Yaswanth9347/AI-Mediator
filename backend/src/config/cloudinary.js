import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Check if Cloudinary is properly configured with valid credentials
// (not placeholder values like "Root", "your_api_key", etc.)
const validateCloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  // Check if all required variables exist
  if (!cloudName || !apiKey || !apiSecret) {
    return false;
  }

  // Check for common placeholder values
  const placeholders = ['Root', 'your_cloud_name', 'your_api_key', 'your_api_secret', 'xxx', 'placeholder'];
  if (placeholders.some(p => cloudName.toLowerCase().includes(p.toLowerCase()))) {
    return false;
  }

  // Cloudinary cloud names are typically alphanumeric with dashes, min 4 chars
  if (cloudName.length < 4 || !/^[a-z0-9-]+$/i.test(cloudName)) {
    return false;
  }

  // API keys are typically 15 digits
  if (!/^\d{15}$/.test(apiKey)) {
    return false;
  }

  return true;
};

const isCloudinaryConfigured = validateCloudinaryConfig();

// 1. Configure the connection
let storage = null;

if (isCloudinaryConfigured) {
  try {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });

    // 2. Setup storage for Multer
    storage = new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'ai_mediator_uploads',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx'],
        resource_type: 'auto'
      },
    });

    console.log('✅ Cloudinary configured successfully');
  } catch (error) {
    console.error('❌ Cloudinary configuration error:', error.message);
    storage = null;
  }
} else {
  console.log('⚠️ Cloudinary credentials invalid or not configured - using local storage');
  console.log('   To enable cloud storage, set valid CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env');
}

export { cloudinary, storage, isCloudinaryConfigured };