/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // LanceDB ships native .node binaries; keep them external to the server bundle.
    serverComponentsExternalPackages: ["@lancedb/lancedb", "apache-arrow"],
  },
};

export default nextConfig;
