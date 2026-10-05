import { defineConfig } from "blume";
import { openapi } from "blume/reference";
import { filesystem } from "blume/sources";

// Pages moved in the 2026-10 navigation restructure. Old URLs stay reachable
// for inbound links from yir.ai pages and search engines.
const movedPages: Record<string, string> = {
  "guides/clients": "integrations/sdk",
  "guides/vercel-ai-sdk": "integrations/vercel-ai-sdk",
  "guides/openai-compatibility": "integrations/openai-compatibility",
  "guides/models": "models",
  "guides/official-api-differences": "models/official-api-differences",
  "guides/webhooks": "production/webhooks",
  "guides/production-integration": "production/checklist",
  "support/error-codes": "production/error-codes",
  "support/troubleshooting": "production/troubleshooting",
  "console/api-keys": "console#api-keys",
  "console/routing": "console#routing-profiles",
  "console/playground": "console#playground",
  "console/logs": "console#logs",
  "console/alerts": "console#alerts",
  "console/webhooks": "production/webhooks#endpoints-and-delivery-history",
};

export default defineConfig({
  title: "Yir Docs",
  description:
    "Build reliable asynchronous image and video generation workflows with Yir.",
  logo: { image: "/logo.svg", text: "Docs", href: "/docs" },
  content: {
    sources: [filesystem({ root: "docs", prefix: "docs" })],
  },
  redirects: Object.entries(movedPages).flatMap(([from, to]) =>
    ["/docs", "/zh/docs"].map((prefix) => ({
      from: `${prefix}/${from}`,
      to: `${prefix}/${to}`,
      status: 301 as const,
    })),
  ),
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
  // Chinese reference first: generated from the English spec by
  // scripts/localize-openapi.mjs and openapi/i18n/zh.json.
  reference: [openapi({
    spec: "openapi/gateway-openapi.reference.zh.json",
    route: "/zh/docs/reference",
    codeSamples: ["curl", "js", "python"],
    playground: false,
  }), openapi({
    spec: "openapi/gateway-openapi.reference.json",
    route: "/docs/reference",
    codeSamples: ["curl", "js", "python"],
    playground: false,
  })],
});
