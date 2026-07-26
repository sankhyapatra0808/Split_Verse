import type { NextFunction, Request, Response } from "express";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

type CompressionEncoding = "br" | "gzip";

const DEFAULT_THRESHOLD_BYTES = 1024;

const COMPRESSIBLE_CONTENT_TYPES = [
  /^text\//i,
  /^application\/json\b/i,
  /^application\/[\w.+-]+\+json\b/i,
  /^application\/javascript\b/i,
  /^application\/xml\b/i,
  /^application\/[\w.+-]+\+xml\b/i,
  /^image\/svg\+xml\b/i,
];

const SKIPPED_CONTENT_TYPES = [
  /^text\/event-stream\b/i,
  /^image\//i,
  /^audio\//i,
  /^video\//i,
  /^font\//i,
  /^application\/(?:zip|gzip|x-gzip|x-brotli|pdf|octet-stream)\b/i,
];

function getHeaderValue(value: number | string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value?.toString() ?? "";
}

function appendVaryAcceptEncoding(res: Response) {
  const current = getHeaderValue(res.getHeader("Vary"));
  const values = current
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    !values.some((value) => value.toLowerCase() === "accept-encoding") &&
    current !== "*"
  ) {
    values.push("Accept-Encoding");
  }

  if (current === "*") {
    res.setHeader("Vary", current);
    return;
  }

  res.setHeader("Vary", values.join(", "));
}

function parseAcceptEncoding(headerValue: string) {
  const accepted = new Map<string, number>();

  for (const entry of headerValue.split(",")) {
    const [rawName, ...rawParams] = entry.trim().split(";");
    const name = rawName.trim().toLowerCase();

    if (!name) {
      continue;
    }

    const qParam = rawParams
      .map((param) => param.trim())
      .find((param) => param.toLowerCase().startsWith("q="));
    const quality = qParam ? Number(qParam.slice(2)) : 1;

    accepted.set(name, Number.isFinite(quality) ? quality : 0);
  }

  return accepted;
}

function selectEncoding(req: Request): CompressionEncoding | null {
  const headerValue = getHeaderValue(req.headers["accept-encoding"]);

  if (!headerValue) {
    return null;
  }

  const accepted = parseAcceptEncoding(headerValue);
  const wildcardQuality = accepted.get("*") ?? 0;
  const brQuality = accepted.get("br") ?? wildcardQuality;
  const gzipQuality = accepted.get("gzip") ?? wildcardQuality;

  if (brQuality <= 0 && gzipQuality <= 0) {
    return null;
  }

  if (brQuality >= gzipQuality && brQuality > 0) {
    return "br";
  }

  return gzipQuality > 0 ? "gzip" : null;
}

function isCompressibleContentType(contentType: string) {
  if (!contentType) {
    return false;
  }

  if (SKIPPED_CONTENT_TYPES.some((pattern) => pattern.test(contentType))) {
    return false;
  }

  return COMPRESSIBLE_CONTENT_TYPES.some((pattern) =>
    pattern.test(contentType),
  );
}

function canCompressByHeaders(req: Request, res: Response) {
  if (req.method === "HEAD") {
    return false;
  }

  if (res.getHeader("Content-Encoding")) {
    return false;
  }

  if ([204, 304].includes(res.statusCode)) {
    return false;
  }

  const cacheControl = getHeaderValue(res.getHeader("Cache-Control"));
  if (/\bno-transform\b/i.test(cacheControl)) {
    return false;
  }

  const contentType = getHeaderValue(res.getHeader("Content-Type"));
  return isCompressibleContentType(contentType);
}

function toBuffer(
  chunk: unknown,
  encoding?: BufferEncoding | (() => void),
): Buffer | null {
  if (chunk === undefined || chunk === null) {
    return null;
  }

  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }

  if (typeof chunk === "string") {
    return Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8");
  }

  return Buffer.from(chunk as ArrayBuffer);
}

function compressBody(body: Buffer, encoding: CompressionEncoding) {
  if (encoding === "br") {
    return brotliCompressSync(body, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 5,
      },
    });
  }

  return gzipSync(body, { level: 6 });
}

export function compressResponses(thresholdBytes = DEFAULT_THRESHOLD_BYTES) {
  return function compressionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const negotiatedEncoding = selectEncoding(req);

    if (!negotiatedEncoding) {
      next();
      return;
    }

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const chunks: Buffer[] = [];
    let passThrough = false;

    function restoreResponseMethods() {
      res.write = originalWrite as typeof res.write;
      res.end = originalEnd as typeof res.end;
    }

    function switchToPassThrough() {
      passThrough = true;
      restoreResponseMethods();
    }

    res.write = function writeOverride(
      chunk: unknown,
      encoding?: BufferEncoding | (() => void),
      callback?: (error?: Error | null) => void,
    ) {
      if (passThrough || !canCompressByHeaders(req, res)) {
        switchToPassThrough();
        return originalWrite(chunk, encoding as BufferEncoding, callback);
      }

      const buffer = toBuffer(chunk, encoding);
      if (buffer) {
        chunks.push(buffer);
      }

      if (typeof encoding === "function") {
        encoding();
      } else {
        callback?.();
      }

      return true;
    } as typeof res.write;

    res.end = function endOverride(
      chunk?: unknown,
      encoding?: BufferEncoding | (() => void),
      callback?: () => void,
    ) {
      if (passThrough || !canCompressByHeaders(req, res)) {
        switchToPassThrough();
        return originalEnd(chunk, encoding as BufferEncoding, callback);
      }

      const finalChunk = toBuffer(chunk, encoding);
      if (finalChunk) {
        chunks.push(finalChunk);
      }

      const body = Buffer.concat(chunks);
      if (body.byteLength < thresholdBytes) {
        switchToPassThrough();
        return originalEnd(body, callback);
      }

      const compressedBody = compressBody(body, negotiatedEncoding);

      appendVaryAcceptEncoding(res);
      res.setHeader("Content-Encoding", negotiatedEncoding);
      res.setHeader("Content-Length", compressedBody.byteLength.toString());
      res.removeHeader("ETag");

      restoreResponseMethods();
      return originalEnd(compressedBody, callback);
    } as typeof res.end;

    next();
  };
}
