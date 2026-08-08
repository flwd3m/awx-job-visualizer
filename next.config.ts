import type { NextConfig } from "next";

const RUNTIME_BASE_PATH_SENTINEL = "/__AWX_JOB_VISUALIZER_RUNTIME_BASE_PATH__";

const nextConfig: NextConfig = {
  basePath:
    process.env.NODE_ENV === "production"
      ? RUNTIME_BASE_PATH_SENTINEL
      : undefined,
  output: "standalone",
  reactCompiler: true,
};

export default nextConfig;
