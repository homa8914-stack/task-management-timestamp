import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "業務記録システム｜菊南病院",
    short_name: "業務記録",
    description: "訪問診療・病棟看護の業務時間記録",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff5f6",
    theme_color: "#fea3aa",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
