import type {ReactNode} from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import {Redirect} from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

// Router paths include baseUrl. The destination has no trailing slash.
const DESTINATION = '/next/getting-started';

export default function NextRootRedirect(): ReactNode {
  const to = useBaseUrl(DESTINATION);
  return (
    <>
      <Head>
        <meta httpEquiv="refresh" content={`0; url=${to}`} />
      </Head>
      <Redirect to={to} />
      <p>
        <Link to={DESTINATION}>Continue to Getting Started</Link>
      </p>
    </>
  );
}
