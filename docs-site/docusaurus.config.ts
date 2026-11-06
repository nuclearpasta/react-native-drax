import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'react-native-drax',
  tagline: 'Drag-and-drop for React Native. Done right.',
  favicon: 'img/favicon-32.png',

  url: 'https://nuclearpasta.com',
  baseUrl: '/react-native-drax/',
  trailingSlash: false,

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
      tagName: 'style',
      attributes: {},
      innerHTML: [
        "@font-face{font-family:'Space Grotesk';font-style:normal;font-weight:300 700;font-display:swap;src:url('/react-native-drax/fonts/space-grotesk-latin.06408904.woff2') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}",
        "@font-face{font-family:'Space Grotesk';font-style:normal;font-weight:300 700;font-display:swap;src:url('/react-native-drax/fonts/space-grotesk-latin-ext.952dddb4.woff2') format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}",
        "@font-face{font-family:'IBM Plex Mono';font-style:normal;font-weight:400;font-display:swap;src:url('/react-native-drax/fonts/ibm-plex-mono-latin-400.08949f72.woff2') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}",
        "@font-face{font-family:'IBM Plex Mono';font-style:normal;font-weight:400;font-display:swap;src:url('/react-native-drax/fonts/ibm-plex-mono-latin-ext-400.6bc0f226.woff2') format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}",
        "@font-face{font-family:'IBM Plex Mono';font-style:normal;font-weight:500;font-display:swap;src:url('/react-native-drax/fonts/ibm-plex-mono-latin-500.01d28544.woff2') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}",
        "@font-face{font-family:'IBM Plex Mono';font-style:normal;font-weight:500;font-display:swap;src:url('/react-native-drax/fonts/ibm-plex-mono-latin-ext-500.6bb06407.woff2') format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}",
        "@font-face{font-family:'IBM Plex Mono';font-style:normal;font-weight:600;font-display:swap;src:url('/react-native-drax/fonts/ibm-plex-mono-latin-600.0d1f0b8d.woff2') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}",
        "@font-face{font-family:'IBM Plex Mono';font-style:normal;font-weight:600;font-display:swap;src:url('/react-native-drax/fonts/ibm-plex-mono-latin-ext-600.32057cf5.woff2') format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}",
      ].join(''),
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
        version: '1.1.0',
        datePublished: '2025-01-01',
        dateModified: '2026-03-23',
        keywords: [
          'react-native',
          'drag-and-drop',
          'sortable',
          'reorderable',
          'reanimated',
          'gesture-handler',
        ],
        author: {
          '@type': 'Organization',
          name: 'NuclearPasta',
          url: 'https://nuclearpasta.com',
        },
        url: 'https://www.npmjs.com/package/react-native-drax',
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
          // npm latest is 1.x. The docs in ./docs are the unreleased 2.x tree.
          lastVersion: '1.x',
          versions: {
            current: {
              label: '2.x (next)',
              path: 'next',
              banner: 'unreleased',
              noIndex: true,
            },
            '1.x': {
              label: 'v1.x',
              // '' is the unprefixed docs root. Keep it explicit so the released
              // version does not fall through to another path.
              path: '',
            },
          },
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          lastmod: 'date',
          changefreq: 'weekly' as const,
          priority: 0.5,
          filename: 'sitemap.xml',
          async createSitemapItems({ defaultCreateSitemapItems, ...params }) {
            const items = await defaultCreateSitemapItems(params);
            // 1.x is the only docs version in the sitemap. 2.x is noindex under
            // /next, including pages that have no released twin. The host 308s
            // /1.x, so those paths are not docs URLs anymore.
            const nextPrefix = '/react-native-drax/next';
            const oldReleasedPrefix = '/react-native-drax/1.x';
            const pathnameOf = (url: string) =>
              new URL(url).pathname.replace(/\/$/, '') || '/';
            const visible = items.filter((item) => {
              const path = pathnameOf(item.url);
              if (path === nextPrefix || path.startsWith(`${nextPrefix}/`)) {
                return false;
              }
              if (path === oldReleasedPrefix || path.startsWith(`${oldReleasedPrefix}/`)) {
                return false;
              }
              return true;
            });
            return visible.map((item) => {
              const path = new URL(item.url).pathname;
              if (path === '/react-native-drax/' || path === '/react-native-drax') {
                return { ...item, priority: 1.0, changefreq: 'weekly' as const };
              }
              if (path.includes('/getting-started') || path.includes('/quick-start')) {
                return { ...item, priority: 0.9, changefreq: 'weekly' as const };
              }
              if (path.includes('/core-concepts') || path.includes('/guides/')) {
                return { ...item, priority: 0.7, changefreq: 'weekly' as const };
              }
              if (path.includes('/examples')) {
                return { ...item, priority: 0.6, changefreq: 'monthly' as const };
              }
              if (path.includes('/api/')) {
                return { ...item, priority: 0.5, changefreq: 'monthly' as const };
              }
              return item;
            });
          },
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
      { property: 'og:image', content: 'https://nuclearpasta.com/react-native-drax/img/social-card.png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: 'https://nuclearpasta.com/react-native-drax/img/social-card.png' },
      { property: 'og:image:alt', content: 'react-native-drax — drag-and-drop framework for React Native' },
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
          href: 'https://nuclearpasta.com/react-native-drax/example',
          label: 'Live Demo',
          position: 'left',
        },
        {
          type: 'docsVersionDropdown',
          position: 'right',
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
              html: '<a href="https://nuclearpasta.com" target="_blank" rel="noopener noreferrer" class="footer__link-item footer-icon-link" aria-label="NuclearPasta"><svg viewBox="0 0 200 200" width="18" height="18"><rect width="200" height="200" rx="40" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="3"/><circle cx="100" cy="60" r="15" fill="#f2b15a"/><circle cx="60" cy="100" r="15" fill="#e67e3d"/><circle cx="100" cy="100" r="15" fill="#cf5f34"/><circle cx="140" cy="100" r="15" fill="#e67e3d"/><circle cx="100" cy="140" r="15" fill="#f2b15a"/></svg><span>NuclearPasta</span></a>',
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
