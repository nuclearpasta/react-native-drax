import React, {type ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {useThemeConfig, type NavbarLogo} from '@docusaurus/theme-common';
import ThemedImage from '@theme/ThemedImage';
import type {Props} from '@theme/Logo';

function LogoThemedImage({
  logo,
  alt,
  imageClassName,
}: {
  logo: NavbarLogo;
  alt: string;
  imageClassName?: string;
}) {
  const sources = {
    light: useBaseUrl(logo.src),
    dark: useBaseUrl(logo.srcDark || logo.src),
  };
  const themedImage = (
    <ThemedImage
      className={logo.className}
      sources={sources}
      height={logo.height}
      width={logo.width}
      alt={alt}
      style={logo.style}
    />
  );

  return imageClassName ? (
    <div className={imageClassName}>{themedImage}</div>
  ) : (
    themedImage
  );
}

export default function Logo(props: Props): ReactNode {
  const {
    siteConfig: {title},
  } = useDocusaurusContext();
  const {
    navbar: {title: navbarTitle, logo},
  } = useThemeConfig();

  const {imageClassName, titleClassName, ...propsRest} = props;
  // useBaseUrl('/') is the baseUrl, which keeps its trailing slash.
  // Link would also restore that slash, so the home link opts out and
  // points at /react-native-drax with no slash.
  const configuredHref = useBaseUrl(logo?.href || '/');
  const logoLink =
    !logo?.href && configuredHref.length > 1 && configuredHref.endsWith('/')
      ? configuredHref.slice(0, -1)
      : configuredHref;

  const fallbackAlt = navbarTitle ? '' : title;
  const alt = logo?.alt ?? fallbackAlt;

  return (
    <Link
      to={logoLink}
      autoAddBaseUrl={false}
      {...propsRest}
      {...(logo?.target && {target: logo.target})}>
      {logo && (
        <LogoThemedImage
          logo={logo}
          alt={alt}
          imageClassName={imageClassName}
        />
      )}
      {navbarTitle != null && <b className={titleClassName}>{navbarTitle}</b>}
    </Link>
  );
}
