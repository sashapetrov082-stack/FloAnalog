import type { MetadataRoute } from "next";

/** Установка на главный экран телефона. Название нейтральное — для приватности на общем экране. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Трекер цикла",
    short_name: "Трекер",
    description: "Календарь цикла и режим пары",
    lang: "ru",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbf8f7",
    theme_color: "#c2416b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
