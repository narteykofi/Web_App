export const cloudinaryConfig = {
  cloudName: "dinxo9bxi",
  unsignedUploadPreset: "web_app",
  folder: "uploads"
};

export function cloudinaryReady() {
  return cloudinaryConfig.cloudName !== "YOUR_CLOUD_NAME"
    && cloudinaryConfig.unsignedUploadPreset !== "YOUR_UNSIGNED_UPLOAD_PRESET";
}
