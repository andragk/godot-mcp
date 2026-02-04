import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Godot MCP Server',
  description: 'Bridge Godot 4.6 to the Model Context Protocol for AI-assisted game development',
  
  // Bilingual support
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Getting Started', link: '/en/getting-started' },
          { text: 'Concepts', link: '/en/concepts' },
          { text: 'API', link: '/en/api/tools' },
          { text: 'Examples', link: '/en/examples' },
        ],
        sidebar: {
          '/en/': [
            {
              text: 'Introduction',
              items: [
                { text: 'Overview', link: '/en/index' },
                { text: 'Getting Started', link: '/en/getting-started' },
                { text: 'Concepts', link: '/en/concepts' },
              ],
            },
            {
              text: 'Guides',
              items: [
                { text: 'Examples', link: '/en/examples' },
                { text: 'Best Practices', link: '/en/best-practices' },
                { text: 'FAQ', link: '/en/faq' },
              ],
            },
            {
              text: 'Architecture',
              items: [
                { text: 'Overview', link: '/en/architecture/overview' },
                { text: 'Components', link: '/en/architecture/components' },
                { text: 'Data Flow', link: '/en/architecture/data-flow' },
                { text: 'Security', link: '/en/architecture/security' },
                { text: 'Decisions (ADRs)', link: '/en/architecture/decisions' },
              ],
            },
            {
              text: 'API Reference',
              items: [
                { text: 'Tools', link: '/en/api/tools' },
                { text: 'Resources', link: '/en/api/resources' },
                { text: 'Godot Bridge', link: '/en/api/godot-bridge' },
                { text: 'Web UI API', link: '/en/api/web-ui' },
                { text: 'Protocol Specification', link: '/en/api/protocol' },
              ],
            },
            {
              text: 'Implementation',
              items: [
                { text: 'Setup', link: '/en/implementation/setup' },
                { text: 'Roadmap', link: '/en/implementation/roadmap' },
                { text: 'Node.js Server', link: '/en/implementation/node-server' },
                { text: 'Godot Bridge', link: '/en/implementation/godot-bridge' },
                { text: 'Web UI', link: '/en/implementation/web-ui' },
                { text: 'Testing', link: '/en/implementation/testing' },
                { text: 'Deployment', link: '/en/implementation/deployment' },
              ],
            },
          ],
        },
        socialLinks: [
          { icon: 'github', link: 'https://github.com/yourusername/godot-mcp-server' },
        ],
        editLink: {
          pattern: 'https://github.com/yourusername/godot-mcp-server/edit/main/docs/:path',
          text: 'Edit this page on GitHub',
        },
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © 2026-present Godot MCP Server Contributors',
        },
        search: {
          provider: 'local',
        },
      },
    },
    de: {
      label: 'Deutsch',
      lang: 'de',
      link: '/de/',
      themeConfig: {
        nav: [
          { text: 'Startseite', link: '/de/' },
          { text: 'Erste Schritte', link: '/de/getting-started' },
          { text: 'Konzepte', link: '/de/concepts' },
          { text: 'API', link: '/de/api/tools' },
          { text: 'Beispiele', link: '/de/examples' },
        ],
        sidebar: {
          '/de/': [
            {
              text: 'Einführung',
              items: [
                { text: 'Übersicht', link: '/de/index' },
                { text: 'Erste Schritte', link: '/de/getting-started' },
                { text: 'Konzepte', link: '/de/concepts' },
              ],
            },
            {
              text: 'Anleitungen',
              items: [
                { text: 'Beispiele', link: '/de/examples' },
                { text: 'Bewährte Verfahren', link: '/de/best-practices' },
                { text: 'Häufig gestellte Fragen', link: '/de/faq' },
              ],
            },
            {
              text: 'Architektur',
              items: [
                { text: 'Übersicht', link: '/de/architecture/overview' },
                { text: 'Komponenten', link: '/de/architecture/components' },
                { text: 'Datenfluss', link: '/de/architecture/data-flow' },
                { text: 'Sicherheit', link: '/de/architecture/security' },
                { text: 'Entscheidungen (ADRs)', link: '/de/architecture/decisions' },
              ],
            },
            {
              text: 'API-Referenz',
              items: [
                { text: 'Werkzeuge', link: '/de/api/tools' },
                { text: 'Ressourcen', link: '/de/api/resources' },
                { text: 'Godot-Brücke', link: '/de/api/godot-bridge' },
                { text: 'Web-UI-API', link: '/de/api/web-ui' },
                { text: 'Protokollspezifikation', link: '/de/api/protocol' },
              ],
            },
            {
              text: 'Implementierung',
              items: [
                { text: 'Fahrplan', link: '/de/implementation/roadmap' },
                { text: 'Einrichtung', link: '/de/implementation/setup' },
                { text: 'Node.js-Server', link: '/de/implementation/node-server' },
                { text: 'Godot-Brücke', link: '/de/implementation/godot-bridge' },
                { text: 'Web-UI', link: '/de/implementation/web-ui' },
                { text: 'Tests', link: '/de/implementation/testing' },
                { text: 'Bereitstellung', link: '/de/implementation/deployment' },
              ],
            },
          ],
        },
        socialLinks: [
          { icon: 'github', link: 'https://github.com/yourusername/godot-mcp-server' },
        ],
        editLink: {
          pattern: 'https://github.com/yourusername/godot-mcp-server/edit/main/docs/:path',
          text: 'Diese Seite auf GitHub bearbeiten',
        },
        footer: {
          message: 'Veröffentlicht unter der MIT-Lizenz.',
          copyright: 'Copyright © 2026-heute Godot MCP Server-Mitwirkende',
        },
        search: {
          provider: 'local',
        },
        docFooter: {
          prev: 'Vorherige Seite',
          next: 'Nächste Seite',
        },
        outline: {
          label: 'Auf dieser Seite',
        },
        lastUpdated: {
          text: 'Zuletzt aktualisiert',
        },
        darkModeSwitchLabel: 'Erscheinungsbild',
        sidebarMenuLabel: 'Menü',
        returnToTopLabel: 'Zurück nach oben',
        langMenuLabel: 'Sprache wechseln',
      },
    },
  },
  
  // Theme configuration
  themeConfig: {
    logo: '/logo.svg',
  },
  
  // Markdown configuration
  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    lineNumbers: true,
    config: (md) => {
      // Custom markdown-it plugins if needed
    },
  },
  
  // Build configuration
  srcDir: '.',
  outDir: '.vitepress/dist',
  cacheDir: '.vitepress/cache',
  
  // SEO and meta
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#478CBF' }], // Godot blue
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:title', content: 'Godot MCP Server | Bridge Godot 4.6 to MCP' }],
    ['meta', { property: 'og:site_name', content: 'Godot MCP Server' }],
    ['meta', { property: 'og:description', content: 'Lightweight MCP server enabling AI-assisted Godot game development through VS Code' }],
  ],
  
  // Performance
  vite: {
    build: {
      minify: 'esbuild',
      chunkSizeWarningLimit: 1000,
    },
  },
  
  // Clean URLs
  cleanUrls: true,
  
  // Last updated timestamp
  lastUpdated: true,
  
  // Ignore dead links (some pages link to working documents or future pages)
  ignoreDeadLinks: true,
})
