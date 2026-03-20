import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'react-native-drax',
  tagline: 'Drag-and-drop for React Native. Done right.',
  favicon: 'img/favicon.ico',

  url: 'https://nuclearpasta.com',
  baseUrl: process.env.BASE_URL ?? '/react-native-drax/',

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
    ],
    navbar: {
      title: 'react-native-drax',
      logo: {
        alt: 'Drax Logo',
        src: 'img/logo.svg',
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
          href: 'https://github.com/nuclearpasta/react-native-drax',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://www.npmjs.com/package/react-native-drax',
          label: 'npm',
          position: 'right',
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
              label: 'GitHub',
              href: 'https://github.com/nuclearpasta/react-native-drax',
            },
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/react-native-drax',
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Nuclear Pasta. Built with Docusaurus.`,
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
