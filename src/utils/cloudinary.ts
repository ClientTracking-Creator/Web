import { doc, setDoc } from "firebase/firestore";
import { db } from "@/config/firebase";

const cloudName = "dscmzagzy";
const uploadPreset = "wpbqkye1";

export async function uploadImageToCloudinary(file: File, userId: string, folder: string) {
  const data = new FormData();
  data.append("file", file);
  data.append("upload_preset", uploadPreset);
  data.append("cloud_name", cloudName);
  data.append("folder", `client_tracking/${userId}/${folder}`);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: data,
  });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error?.message || "Failed to upload image.");

  const id = result.asset_id || `${Date.now()}`;
  await setDoc(doc(db, "users", userId, "storage_uploads", id), {
    id,
    provider: "cloudinary",
    folder,
    url: result.secure_url,
    publicId: result.public_id || "",
    bytes: Number(result.bytes) || 0,
    format: result.format || "",
    createdAt: new Date().toISOString(),
  }, { merge: true });

  return result.secure_url as string;
}

