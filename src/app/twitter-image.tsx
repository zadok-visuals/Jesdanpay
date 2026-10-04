import { generateShareImage, ogImageSize } from "@/lib/og-image";

export const alt = "JesDanPay — Facilitating suppliers payment to China.";
export const size = ogImageSize;
export const contentType = "image/png";

export default function Image() {
  return generateShareImage();
}
