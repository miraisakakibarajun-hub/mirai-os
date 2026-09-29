import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {'/api/forms/nagoya': ['./templates/nagoya/keikaku.xlsx']},
};

export default nextConfig;
