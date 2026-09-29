import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {'/api/forms/nagoya': ['./templates/nagoya/*.xlsx']},
};

export default nextConfig;
