import { defineConfig } from "blume";
import { script } from "blume/analytics";
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

// Crisp chat bubble on every docs page, tagged so support can tell docs
// questions apart. The client router swaps <body> on navigation, so the
// widget is carried into the incoming document to stay visible.
const crispChat = `if (!window.$crisp) {
  window.$crisp = [];
  window.CRISP_WEBSITE_ID = "85410c3f-bc07-428b-99d1-d5bfe5062bd9";
  window.CRISP_RUNTIME_CONFIG = { locale: location.pathname.startsWith("/zh/") ? "zh" : "en" };
  $crisp.push(["set", "session:segments", [["yir", "docs"]]]);
  $crisp.push(["set", "session:data", [[["product", "yir"], ["intent", "support"], ["entry_point", "docs"]]]]);
  document.addEventListener("astro:before-swap", (event) => {
    const widget = document.querySelector(".crisp-client");
    if (widget) event.newDocument.body.appendChild(widget);
  });
  const loader = document.createElement("script");
  loader.src = "https://client.crisp.chat/l.js";
  loader.async = true;
  document.head.appendChild(loader);
}`;

// On yir.ai the docs share an origin with the site, so every "home" link
// (header tab, logo, 404 page) points at "/" or "/zh". Locally the docs run
// alone on :40084; send those paths to the web dev server on :38084, mirroring
// how yir-web redirects /docs to this port. Dev server only.
const devSiteHome = {
  name: "yir-dev-site-home",
  hooks: {
    "astro:server:setup": ({ server }) => {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split(/[?#]/u)[0].replace(/\/$/u, "") ?? "";
        if (path !== "" && path !== "/zh") return next();
        res.statusCode = 302;
        res.setHeader("Location", `http://localhost:38084${path || "/"}`);
        res.end();
      });
    },
  },
} satisfies NonNullable<Parameters<typeof defineConfig>[0]["integrations"]>[number];

export default defineConfig({
  integrations: [devSiteHome],
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
    // Docs ship under yir.ai/docs; "/" is the yir.ai home (localized to /zh).
    tabs: [
      { label: { en: "Home", zh: "首页" }, path: "/home", href: "/" },
      { label: { en: "Docs", zh: "文档" }, path: "/docs" },
      { label: { en: "API Reference", zh: "API 参考" }, path: "/docs/reference" },
    ],
  },
  github: { owner: "yir-ai", repo: "docs", branch: "main" },
  analytics: [script({ content: crispChat })],
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
