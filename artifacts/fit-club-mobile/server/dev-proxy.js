/**
 * Development-only Expo proxy.
 *
 * Replit serves this artifact at /mobile/, but Metro's development HTML emits
 * root-relative asset URLs. This proxy keeps the direct Expo origin unchanged
 * while making the path-based preview request its bundle through /mobile/.
 */
const http = require('http');
const { spawn } = require('child_process');

const previewPath = '/mobile';
const publicPort = Number(process.env.PORT);
const metroPort = publicPort + 1;

if (!Number.isInteger(publicPort) || publicPort <= 0) {
  throw new Error('PORT must be set to the artifact preview port.');
}

function toUpstreamPath(requestUrl) {
  const url = new URL(requestUrl, 'http://localhost');
  const isPreviewRequest =
    url.pathname === previewPath || url.pathname.startsWith(`${previewPath}/`);

  if (isPreviewRequest) {
    url.pathname = url.pathname.slice(previewPath.length) || '/';
  }

  return {
    isPreviewRequest,
    path: `${url.pathname}${url.search}`,
  };
}

function rewritePreviewHtml(html) {
  const withPrefixedBundle = html.replace(
    /(<script\b[^>]*\bsrc=")\/([^"]+\.bundle(?:\?[^"]*)?)"/gi,
    (_match, prefix, bundlePath) => {
      const separator = bundlePath.includes('?') ? '&' : '?';
      return `${prefix}${previewPath}/${bundlePath}${separator}transform.baseUrl=%2Fmobile"`;
    },
  );

  return withPrefixedBundle.replace(
    /\b(src|href)="\/(?!mobile(?:\/|"))/gi,
    `$1="${previewPath}/`,
  );
}

function startMetro() {
  const metro = spawn(
    'pnpm',
    ['exec', 'expo', 'start', '--localhost', '--port', String(metroPort)],
    {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(metroPort) },
      stdio: 'inherit',
    },
  );

  metro.on('exit', (code, signal) => {
    if (signal || code !== 0) {
      process.exitCode = code ?? 1;
      server.close();
    }
  });

  return metro;
}

const server = http.createServer((req, res) => {
  const { isPreviewRequest, path } = toUpstreamPath(req.url || '/');
  const headers = { ...req.headers, host: `localhost:${metroPort}` };
  delete headers.origin;
  delete headers['accept-encoding'];

  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: metroPort,
      path,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      const contentType = String(upstreamRes.headers['content-type'] || '');

      if (!isPreviewRequest || !contentType.includes('text/html')) {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
        return;
      }

      const chunks = [];
      upstreamRes.on('data', (chunk) => chunks.push(chunk));
      upstreamRes.on('end', () => {
        const body = rewritePreviewHtml(Buffer.concat(chunks).toString('utf8'));
        const responseHeaders = { ...upstreamRes.headers };
        delete responseHeaders['content-length'];
        delete responseHeaders.etag;
        res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
        res.end(body);
      });
    },
  );

  upstream.on('error', () => {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Expo development server is starting' }));
  });

  req.pipe(upstream);
});

const metro = startMetro();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    metro.kill(signal);
    server.close(() => process.exit(0));
  });
}

server.listen(publicPort, '0.0.0.0');