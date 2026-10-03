import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Boulevard Club", short_name: "Boulevard", description: "Good games. Better company.",
    start_url: "/", scope: "/", display: "standalone", background_color: "#f7f5ef",
    theme_color: "#f7f5ef", lang: "en", orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
