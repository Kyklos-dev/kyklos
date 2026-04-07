import { defineConfig } from "vitepress";

/** GitHub project pages need a repo prefix (e.g. /kyklos/). Set VITEPRESS_BASE in CI. */
const base = (() => {
  const b = process.env.VITEPRESS_BASE?.trim();
  if (!b) return "/";
  return b.endsWith("/") ? b : `${b}/`;
})();

export default defineConfig({
  base,
  title: "Kyklos",
  description:
    "CI/CD-style orchestration for AI agent pipelines — pipelines, runs, eval fingerprints, dashboard.",
  head: [
    ["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
    ["meta", { name: "theme-color", content: "#24292f" }],
  ],
  appearance: true,
  cleanUrls: true,
  themeConfig: {
    /* Wordmark is in logo SVG; hide duplicate title text in nav */
    siteTitle: false,
    logo: { light: "/logo.svg", dark: "/logo-dark.svg" },
    nav: [
      { text: "Product", link: "/introduction/what-is-kyklos", activeMatch: "/introduction/" },
      {
        text: "Understanding",
        link: "/guides/understanding-kyklos",
        activeMatch: "^/guides/(understanding|pipeline-yaml|scores-from|artifacts|best-practices)",
      },
      { text: "Concepts", link: "/concepts/architecture", activeMatch: "/concepts/" },
      { text: "Guides", link: "/guides/pipelines/", activeMatch: "/guides/" },
      { text: "Use a release", link: "/getting-started" },
      { text: "Contributing", link: "/contributing/", activeMatch: "/contributing/" },
      { text: "GitHub", link: "https://github.com/kyklos/kyklos" },
    ],
    sidebar: [
      {
        text: "Product",
        items: [
          { text: "What is Kyklos?", link: "/introduction/what-is-kyklos" },
          { text: "Features", link: "/introduction/features" },
          { text: "Who it’s for", link: "/introduction/who-its-for" },
        ],
      },
      {
        text: "Concepts",
        items: [
          { text: "Architecture", link: "/concepts/architecture" },
          { text: "Runs & workspaces", link: "/concepts/runs-and-workspaces" },
          { text: "Eval bundles & fingerprints", link: "/concepts/eval-bundles" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Understanding Kyklos", link: "/guides/understanding-kyklos" },
          { text: "Pipeline YAML structure", link: "/guides/pipeline-yaml-structure" },
          { text: "Scores, from & pass_if", link: "/guides/scores-from-and-pass-if" },
          { text: "Artifacts", link: "/guides/artifacts" },
          { text: "Best practices", link: "/guides/best-practices" },
          {
            text: "Pipelines",
            collapsed: false,
            items: [
              { text: "Overview", link: "/guides/pipelines/" },
              { text: "YAML reference", link: "/guides/pipelines/yaml-reference" },
              { text: "Stages, gates & failure", link: "/guides/pipelines/stages-gates-and-failure" },
              { text: "Code examples", link: "/guides/pipelines/code-examples" },
            ],
          },
          { text: "Triggers & Git", link: "/guides/triggers-and-git" },
          { text: "Configuration", link: "/guides/configuration" },
          { text: "Dashboard & API", link: "/guides/dashboard" },
        ],
      },
      {
        text: "Use a release",
        items: [{ text: "Download & run", link: "/getting-started" }],
      },
      {
        text: "Contributing",
        items: [{ text: "Run locally (from source)", link: "/contributing/" }],
      },
      {
        text: "Reference",
        items: [{ text: "FAQ", link: "/faq" }],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/kyklos/kyklos" }],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © Kyklos contributors",
    },
    search: { provider: "local" },
  },
});
