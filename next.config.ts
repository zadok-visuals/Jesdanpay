import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  devIndicators: false,
  // Safety net only — every file upload now goes straight from the browser to Supabase Storage
  // (see src/lib/storage/clientUpload.ts) rather than through a server action's own FormData, so
  // action bodies should never approach this. Raised a little past Next's 1MB default purely to
  // give normal multi-field form submissions headroom, not to accommodate files.
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
