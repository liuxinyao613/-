import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Relationship Boundary Map",
    short_name: "Boundary Map",
    description: "记录个人关系中的接受边界、条件、代价与未知区域。",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1eb",
    theme_color: "#f4f1eb",
    lang: "zh-CN",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
