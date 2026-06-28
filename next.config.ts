import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";

// .env を確実に読み込む（Windows / OneDrive 環境対策）
loadEnvConfig(process.cwd());

const nextConfig: NextConfig = {};

export default nextConfig;
