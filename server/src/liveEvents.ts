import type { Response } from "express";

type LiveUpdatePayload = {
  type: string;
  reason?: string;
  roomId?: string;
  conversationId?: string;
};

const liveClients = new Map<string, Set<Response>>();

function writeEvent(res: Response, event: string, payload: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function registerLiveClient(userId: string, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const clients = liveClients.get(userId) ?? new Set<Response>();
  clients.add(res);
  liveClients.set(userId, clients);

  writeEvent(res, "connected", { ok: true });

  const keepAlive = setInterval(() => {
    writeEvent(res, "ping", { now: Date.now() });
  }, 25000);

  res.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);

    if (clients.size === 0) {
      liveClients.delete(userId);
    }
  });
}

export function sendLiveUpdate(
  userIds: Array<string | null | undefined>,
  payload: LiveUpdatePayload,
) {
  const uniqueUserIds = Array.from(
    new Set(userIds.filter((userId): userId is string => Boolean(userId))),
  );

  uniqueUserIds.forEach((userId) => {
    const clients = liveClients.get(userId);

    clients?.forEach((res) => {
      try {
        writeEvent(res, "update", payload);
      } catch {
        clients.delete(res);
      }
    });

    if (clients?.size === 0) {
      liveClients.delete(userId);
    }
  });
}
