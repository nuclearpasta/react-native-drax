import React, {type ReactNode} from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {
  useActiveDocContext,
  useActiveVersion,
  useLatestVersion,
} from '@docusaurus/plugin-content-docs/client';
import DefaultNavbarItem from '@theme/NavbarItem/DefaultNavbarItem';
import type {Props} from '@theme/NavbarItem/DocSidebarNavbarItem';

function withoutBaseUrl(path: string, baseUrl: string): string {
  const prefix = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  if (prefix && path.startsWith(prefix)) {
    return path.slice(prefix.length) || '/';
  }
  return path;
}

export default function DocSidebarNavbarItem({
  sidebarId,
  label,
  docsPluginId,
  ...props
}: Props): ReactNode {
  const {
    siteConfig: {baseUrl},
  } = useDocusaurusContext();
  const {activeDoc} = useActiveDocContext(docsPluginId);
  const activeVersion = useActiveVersion(docsPluginId);
  const latestVersion = useLatestVersion(docsPluginId);
  const sidebarLink = latestVersion.sidebars?.[sidebarId]?.link;
  if (!sidebarLink) {
    throw new Error(
      `DocSidebarNavbarItem: Sidebar with ID "${sidebarId}" doesn't have anything to be linked to.`,
    );
  }
  return (
    <DefaultNavbarItem
      exact
      {...props}
      isActive={() =>
        activeVersion?.name === latestVersion.name &&
        activeDoc?.sidebar === sidebarId
      }
      label={label ?? sidebarLink.label}
      to={withoutBaseUrl(sidebarLink.path, baseUrl)}
    />
  );
}
