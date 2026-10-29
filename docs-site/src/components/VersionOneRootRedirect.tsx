import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import {Redirect} from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

// Router paths include baseUrl (Docusaurus does not set a React Router basename).
// The host 308s /react-native-drax/1.x/ to /react-native-drax/1.x. The destination
// must not have a trailing slash, or that 308 loops.
const DESTINATION = '/1.x/getting-started';

export default function VersionOneRootRedirect() {
  const to = useBaseUrl(DESTINATION);
  return (
    <>
      <Head>
        <meta httpEquiv="refresh" content={`0; url=${to}`} />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="googlebot" content="noindex, nofollow" />
      </Head>
      <Redirect to={to} />
      <p>
        <Link to={DESTINATION}>Continue to Getting Started</Link>
      </p>
    </>
  );
}
