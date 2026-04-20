import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["libsql", "@libsql/client", "@prisma/adapter-libsql"],
};

export default nextConfig;
