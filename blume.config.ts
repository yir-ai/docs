import { defineConfig } from "blume";
import { script } from "blume/analytics";
import { openapi } from "blume/reference";
import { filesystem } from "blume/sources";

const themeSync = `(()=>{const d=document.documentElement;const get=(k)=>{try{return localStorage.getItem(k);}catch{return null;}};const set=(k,v)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v);}catch{}};const apply=()=>{const p=get("yir-theme");if(p==="light"||p==="dark"){set("blume-theme",p);d.dataset.theme=p;}else if(p==="system"){set("blume-theme",null);d.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}};apply();document.addEventListener("astro:after-swap",apply);document.addEventListener("click",(e)=>{if(e.target.closest("[data-blume-theme-toggle]")){setTimeout(()=>set("yir-theme",d.dataset.theme),0);}});})();`;

export default defineConfig({
  title: "Yir Developer Documentation",
  description:
    "Build reliable asynchronous image and video generation workflows with Yir.",
  logo: { image: "/logo.svg", text: "Docs", href: "/docs" },
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
  // yir.ai and its docs share one origin: follow the site's `yir-theme`
  // preference and write header toggles back to it. Blume emits this in
  // production builds only.
  analytics: [script({ content: themeSync })],
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
