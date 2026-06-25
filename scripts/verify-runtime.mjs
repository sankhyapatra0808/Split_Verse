import { existsSync, readFileSync } from "node:fs";
import { preview as startPreview } from "vite";

const host = "127.0.0.1";
const port = 4173;
const baseUrl = `http://${host}:${port}`;

if (!existsSync("dist/index.html")) {
  throw new Error("dist/index.html is missing. Run npm run build before verify:runtime.");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, attempts = 40) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }

    await wait(250);
  }

  throw lastError;
}

function getReferencedAssetPaths(html) {
  const assetMatches = html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g);

  return [...assetMatches].map((match) => match[1]);
}

const preview = await startPreview({
  preview: {
    host,
    port,
    strictPort: true,
  },
});

try {
  const response = await waitForHttp(baseUrl);
  const html = await response.text();

  if (!html.includes('<div id="root">')) {
    throw new Error("Preview HTML did not include the React root element.");
  }

  const localHtml = readFileSync("dist/index.html", "utf8");
  const assetPaths = getReferencedAssetPaths(localHtml);

  if (assetPaths.length === 0) {
    throw new Error("No built asset references were found in dist/index.html.");
  }

  for (const assetPath of assetPaths) {
    const assetResponse = await fetch(`${baseUrl}${assetPath}`);

    if (!assetResponse.ok) {
      throw new Error(`Built asset failed to load: ${assetPath}`);
    }
  }

  for (const route of ["/", "/settings", "/split-rooms"]) {
    const routeResponse = await fetch(`${baseUrl}${route}`);

    if (!routeResponse.ok) {
      throw new Error(`Route smoke check failed for ${route}: ${routeResponse.status}`);
    }
  }

  console.log("Runtime preview smoke checks passed.");
} catch (error) {
  throw error;
} finally {
  await new Promise((resolve, reject) => {
    preview.httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(undefined);
    });
  });
}
