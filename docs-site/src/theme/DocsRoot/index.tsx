/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import {ThemeClassNames, HtmlClassNameProvider} from '@docusaurus/theme-common';
import {useLocation} from '@docusaurus/router';
import renderRoutes from '@docusaurus/renderRoutes';
import routes from '@generated/routes';
import Layout from '@theme/Layout';
import NotFound from '@theme/NotFound';
import type {Props} from '@theme/DocsRoot';
import {isNotFoundLocation} from '../notFoundRoute';

export default function DocsRoot(props: Props): ReactNode {
  const {pathname} = useLocation();
  // Unknown /next URLs match this parent. Rendering the version shell there
  // disagrees with the static 404.html (the catch-all NotFound page).
  if (isNotFoundLocation(pathname, routes)) {
    return <NotFound />;
  }
  return (
    <HtmlClassNameProvider className={clsx(ThemeClassNames.wrapper.docsPages)}>
      <Layout>{renderRoutes(props.route.routes!)}</Layout>
    </HtmlClassNameProvider>
  );
}
