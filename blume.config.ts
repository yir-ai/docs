import { defineConfig } from "blume";
import { openapi } from "blume/reference";
import { filesystem } from "blume/sources";

export default defineConfig({
  title: "Yir Developer Documentation",
  description:
    "Build reliable asynchronous image and video generation workflows with Yir.",
  content: {
    sources: [filesystem({ root: "docs", prefix: "docs" })],
  },
  deployment: {
    site: "https://yir.ai",
  },
  theme: {
    accent: "green",
    action: "#2f6f43",
    mode: "system",
    radius: "lg",
  },
  navigation: {
    repo: true,
    sidebar: { display: "flat" },
  },
  github: { owner: "yir-ai", repo: "docs", branch: "main" },
  feedback: false,
  export: false,
  ai: {
    assistant: { enabled: false },
    openInChat: false,
  },
  agents: {
    api: false,
    catalog: false,
    llmsTxt: true,
    mcp: { enabled: false },
    webmcp: false,
  },
  i18n: {
    defaultLocale: "en",
    fallbackLocale: "en",
    hideDefaultLocalePrefix: true,
    parser: "dir",
    locales: [
      { code: "en", label: "English" },
      {
        code: "zh",
        label: "简体中文",
        style:
          "Simplified Chinese for software developers; concise and precise.",
      },
    ],
  },
  reference: [openapi({
    spec: "openapi/gateway-openapi.reference.json",
    route: "/docs/reference",
    codeSamples: ["curl", "js", "python"],
    playground: false,
  })],
});
