import type { MetadataRoute } from "next";

/**
 * Web Share Target: on Android, "Share → Fitsss" from Pinterest or the gallery
 * posts to /api/share, which turns it into an inspo. `MetadataRoute.Manifest`
 * has no share_target member yet, so the field is merged in as extra keys.
 */
const SHARE_TARGET = {
  share_target: {
    action: "/api/share",
    method: "POST",
    enctype: "multipart/form-data",
    params: {
      title: "title",
      text: "text",
      url: "url",
      files: [{ name: "image", accept: ["image/*"] }],
    },
  },
} as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    ...(SHARE_TARGET as unknown as MetadataRoute.Manifest),
    name: "Fitsss",
    short_name: "Fitsss",
    description: "Your wardrobe as blocks: what you own, and what to wear from it.",
    display: "standalone",
    orientation: "portrait",
    start_url: "/closet",
    scope: "/",
    background_color: "#ffffff",
    theme_color: "#f2f2f7",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "maskable" },
    ],
  };
}
