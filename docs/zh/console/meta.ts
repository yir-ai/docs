import { defineMeta } from "blume";

export default defineMeta({
  title: "Console",
  icon: "layout-dashboard",
  order: 5,
  pages: ["api-keys", "routing", "playground", "logs", "webhooks", "alerts"],
});
