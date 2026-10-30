import React, {type ReactNode} from 'react';
import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {PageMetadata, useThemeConfig} from '@docusaurus/theme-common';
import {
  DEFAULT_SEARCH_TAG,
  useAlternatePageUtils,
  keyboardFocusedClassName,
} from '@docusaurus/theme-common/internal';
import {useLocation} from '@docusaurus/router';
import {applyTrailingSlash} from '@docusaurus/utils-common';
import {useAllDocsData} from '@docusaurus/plugin-content-docs/client';
import SearchMetadata from '@theme/SearchMetadata';

// baseUrl stays `/react-native-drax/` so routing and assets keep working.
// The host serves the docs home at that path without a trailing slash.
function homePath(path: string, baseUrl: string): string {
  if (baseUrl !== '/' && path === baseUrl) {
    return baseUrl.replace(/\/$/, '');
  }
  return path;
}

function isNotFoundPath(pathname: string): boolean {
  return /\/404(?:\.html)?$/.test(pathname);
}

function alternateHref(href: string, siteUrl: string, baseUrl: string): string {
  const slashed = `${siteUrl.replace(/\/$/, '')}${baseUrl}`;
  if (baseUrl !== '/' && baseUrl.endsWith('/') && href === slashed) {
    return slashed.replace(/\/$/, '');
  }
  return href;
}

function AlternateLangHeaders(): ReactNode {
  const {
    siteConfig: {url: siteUrl, baseUrl},
    i18n: {currentLocale, defaultLocale, localeConfigs},
  } = useDocusaurusContext();
  const alternatePageUtils = useAlternatePageUtils();

  const currentHtmlLang = localeConfigs[currentLocale]!.htmlLang;

  const bcp47ToOpenGraphLocale = (code: string): string =>
    code.replace('-', '_');

  const hrefFor = (locale: string) =>
    alternateHref(
      alternatePageUtils.createUrl({
        locale,
        fullyQualified: true,
      }),
      siteUrl,
      baseUrl,
    );

  return (
    <Head>
      {Object.entries(localeConfigs).map(([locale, {htmlLang}]) => (
        <link
          key={locale}
          rel="alternate"
          href={hrefFor(locale)}
          hrefLang={htmlLang}
        />
      ))}
      <link
        rel="alternate"
        href={hrefFor(defaultLocale)}
        hrefLang="x-default"
      />

      <meta
        property="og:locale"
        content={bcp47ToOpenGraphLocale(currentHtmlLang)}
      />
      {Object.values(localeConfigs)
        .filter((config) => currentHtmlLang !== config.htmlLang)
        .map((config) => (
          <meta
            key={`meta-og-${config.htmlLang}`}
            property="og:locale:alternate"
            content={bcp47ToOpenGraphLocale(config.htmlLang)}
          />
        ))}
    </Head>
  );
}

function samePath(left: string, right: string): boolean {
  const normalize = (path: string) => path.replace(/\/$/, '') || '/';
  return normalize(left) === normalize(right);
}

function useActiveDocsVersion() {
  const {pathname} = useLocation();
  const allDocsData = useAllDocsData();
  for (const pluginData of Object.values(allDocsData)) {
    const active = [...pluginData.versions]
      .sort((a, b) => b.path.length - a.path.length)
      .find(
        (version) =>
          samePath(pathname, version.path) ||
          pathname.startsWith(`${version.path.replace(/\/$/, '')}/`),
      );
    if (active) {
      return active;
    }
  }
  return undefined;
}

function useCanonicalUrl(): string {
  const {
    siteConfig: {url: siteUrl, baseUrl, trailingSlash},
  } = useDocusaurusContext();
  const {pathname} = useLocation();

  // Every page, including /next, canonicalizes to itself. The unreleased
  // version stays noindex; it does not point search engines at the 1.x twin.
  const defaultPath = homePath(
    applyTrailingSlash(useBaseUrl(pathname), {
      trailingSlash,
      baseUrl,
    }),
    baseUrl,
  );
  return siteUrl + defaultPath;
}

function RobotsHeaders(): ReactNode {
  const {pathname} = useLocation();
  if (isNotFoundPath(pathname)) {
    return (
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
    );
  }
  const active = useActiveDocsVersion();
  if (active && !active.isLast) {
    return null;
  }
  return (
    <Head>
      <meta name="robots" content="index, follow" />
      <meta
        name="googlebot"
        content="index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1"
      />
    </Head>
  );
}

function CanonicalUrlHeaders(): ReactNode {
  const {pathname} = useLocation();
  const canonicalUrl = useCanonicalUrl();
  if (isNotFoundPath(pathname)) {
    return null;
  }
  return (
    <Head>
      <meta property="og:url" content={canonicalUrl} />
      <link rel="canonical" href={canonicalUrl} />
    </Head>
  );
}

export default function SiteMetadata(): ReactNode {
  const {
    i18n: {currentLocale},
  } = useDocusaurusContext();
  const {metadata, image: defaultImage} = useThemeConfig();

  return (
    <>
      <Head>
        <meta name="twitter:card" content="summary_large_image" />
        <body className={keyboardFocusedClassName} />
      </Head>

      {defaultImage && <PageMetadata image={defaultImage} />}

      <CanonicalUrlHeaders />

      <RobotsHeaders />

      <AlternateLangHeaders />

      <SearchMetadata tag={DEFAULT_SEARCH_TAG} locale={currentLocale} />

      <Head>
        {metadata.map((metadatum, i) => (
          <meta key={i} {...metadatum} />
        ))}
      </Head>
    </>
  );
}
