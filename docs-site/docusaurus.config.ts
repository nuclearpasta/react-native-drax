import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'react-native-drax',
  tagline: 'Drag-and-drop for React Native. Done right.',
  favicon: 'img/favicon-32.png',

  url: 'https://nuclearpasta.com',
  baseUrl: '/react-native-drax/',

  organizationName: 'nuclearpasta',
  projectName: 'react-native-drax',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  headTags: [
    {
      tagName: 'meta',
      attributes: {
        name: 'robots',
        content: 'index, follow',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'googlebot',
        content:
          'index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'author',
        content: 'Nuclear Pasta',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'theme-color',
        content: '#0c0c0e',
        media: '(prefers-color-scheme: dark)',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'theme-color',
        content: '#f3f3f0',
        media: '(prefers-color-scheme: light)',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/react-native-drax/img/favicon.svg',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/react-native-drax/img/apple-touch-icon.png',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossorigin: 'anonymous',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap',
      },
    },
    {
      tagName: 'script',
      attributes: {
        type: 'application/ld+json',
      },
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareSourceCode',
        name: 'react-native-drax',
        description:
          'A drag-and-drop framework for React Native supporting sortable lists, grids, cross-container drag, and more.',
        codeRepository: 'https://github.com/nuclearpasta/react-native-drax',
        programmingLanguage: 'TypeScript',
        runtimePlatform: 'React Native',
        license: 'https://opensource.org/licenses/MIT',
        operatingSystem: ['iOS', 'Android', 'Web'],
      }),
    },
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/nuclearpasta/react-native-drax/tree/main/docs-site/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          changefreq: 'weekly' as const,
          priority: 0.5,
          filename: 'sitemap.xml',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    metadata: [
      {
        name: 'keywords',
        content:
          'react-native, drag-and-drop, sortable, reorderable, drax, reanimated, gesture-handler, ios, android, web',
      },
      {
        name: 'description',
        content:
          'A drag-and-drop framework for React Native with sortable lists, grids, cross-container drag, drag handles, collision algorithms, and more.',
      },
      { property: 'og:site_name', content: 'react-native-drax' },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: 'en_US' },
      { property: 'og:url', content: 'https://nuclearpasta.com/react-native-drax/' },
      { property: 'og:image', content: 'https://nuclearpasta.com/react-native-drax/img/social-card.png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: 'https://nuclearpasta.com/react-native-drax/img/social-card.png' },
    ],
    navbar: {
      title: 'react-native-drax',
      logo: {
        alt: 'NuclearPasta Logo',
        src: 'img/logo.svg',
        srcDark: 'img/logo-dark.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'docSidebar',
          sidebarId: 'api',
          position: 'left',
          label: 'API',
        },
        {
          href: 'https://nuclearpasta.com/react-native-drax/example/',
          label: 'Live Demo',
          position: 'left',
        },
        {
          type: 'html',
          position: 'right',
          value: '<a href="https://www.npmjs.com/package/react-native-drax" target="_blank" rel="noopener noreferrer" class="navbar-icon-link" aria-label="npm" title="npm"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 3h18v18H12.6V6.6h-4.2V21H3V3Z"/></svg><span>npm</span></a>',
        },
        {
          type: 'html',
          position: 'right',
          value: '<a href="https://github.com/nuclearpasta/react-native-drax" target="_blank" rel="noopener noreferrer" class="navbar-icon-link" aria-label="GitHub" title="GitHub"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.47c.53.1.72-.22.72-.5v-1.76c-2.95.64-3.57-1.25-3.57-1.25-.48-1.2-1.16-1.52-1.16-1.52-.95-.64.07-.63.07-.63 1.05.08 1.6 1.07 1.6 1.07.94 1.6 2.47 1.13 3.07.86.1-.67.36-1.13.66-1.4-2.35-.26-4.82-1.16-4.82-5.2 0-1.15.42-2.09 1.08-2.83-.1-.27-.47-1.36.11-2.82 0 0 .89-.28 2.92 1.08a10.26 10.26 0 0 1 5.32 0c2.03-1.36 2.92-1.08 2.92-1.08.58 1.46.21 2.55.11 2.82.67.74 1.08 1.68 1.08 2.83 0 4.05-2.48 4.93-4.84 5.19.37.32.71.94.71 1.91v2.83c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5Z"/></svg><span>GitHub</span></a>',
        },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/getting-started' },
            { label: 'Guides', to: '/guides/drag-and-drop' },
            { label: 'API Reference', to: '/api/components/drax-provider' },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub Discussions',
              href: 'https://github.com/nuclearpasta/react-native-drax/discussions',
            },
            {
              label: 'Issues',
              href: 'https://github.com/nuclearpasta/react-native-drax/issues',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              html: '<a href="https://github.com/nuclearpasta/react-native-drax" target="_blank" rel="noopener noreferrer" class="footer__link-item footer-icon-link" aria-label="GitHub"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.47c.53.1.72-.22.72-.5v-1.76c-2.95.64-3.57-1.25-3.57-1.25-.48-1.2-1.16-1.52-1.16-1.52-.95-.64.07-.63.07-.63 1.05.08 1.6 1.07 1.6 1.07.94 1.6 2.47 1.13 3.07.86.1-.67.36-1.13.66-1.4-2.35-.26-4.82-1.16-4.82-5.2 0-1.15.42-2.09 1.08-2.83-.1-.27-.47-1.36.11-2.82 0 0 .89-.28 2.92 1.08a10.26 10.26 0 0 1 5.32 0c2.03-1.36 2.92-1.08 2.92-1.08.58 1.46.21 2.55.11 2.82.67.74 1.08 1.68 1.08 2.83 0 4.05-2.48 4.93-4.84 5.19.37.32.71.94.71 1.91v2.83c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5Z"/></svg><span>GitHub</span></a>',
            },
            {
              html: '<a href="https://www.npmjs.com/package/react-native-drax" target="_blank" rel="noopener noreferrer" class="footer__link-item footer-icon-link" aria-label="npm"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 3h18v18H12.6V6.6h-4.2V21H3V3Z"/></svg><span>npm</span></a>',
            },
            {
              html: '<a href="https://nuclearpasta.com" target="_blank" rel="noopener noreferrer" class="footer__link-item footer-icon-link" aria-label="NuclearPasta"><svg viewBox="0 0 200 200" width="18" height="18"><rect x="8" y="8" width="184" height="184" rx="44" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="8"/><circle cx="100" cy="60" r="15" fill="#f2b15a"/><circle cx="60" cy="100" r="15" fill="#e67e3d"/><circle cx="100" cy="100" r="15" fill="#cf5f34"/><circle cx="140" cy="100" r="15" fill="#e67e3d"/><circle cx="100" cy="140" r="15" fill="#f2b15a"/></svg><span>NuclearPasta</span></a>',
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} NuclearPasta. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'tsx', 'typescript'],
    },
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
