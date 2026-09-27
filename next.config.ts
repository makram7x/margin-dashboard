import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Uploads are whole workbooks; the default 1 MB server-action limit is too small for a year of timesheets.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
};

export default nextConfig;
