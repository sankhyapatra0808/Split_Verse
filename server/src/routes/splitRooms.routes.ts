import express from "express";
import { z } from "zod";
import { db } from "../config/db.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";
import { sendLiveUpdate } from "../liveEvents.js";
import {
  sendWalletPinError,
  verifyWalletPinForUser,
} from "../utils/walletPin.js";
import {
  moneyAmountSchema,
  parseRequestBody,
  safeTextSchema,
  sendValidationError,
} from "../middleware/validateRequest.js";

const router = express.Router();
const maxSplitRoomsPerDay = 10;
const splitRoomMemberInsertChunkSize = 500;
const maxSplitRoomItemAmount = Number(process.env.MAX_SPLIT_ROOM_ITEM_AMOUNT || 1000000);

const createSplitRoomSchema = z
  .object({
    name: safeTextSchema("Room name", 100),
    category: z.string().trim().max(60, "Category is too long").optional().default("general"),
    members: z.array(z.string().trim().max(120, "Member value is too long")).max(20, "You can add up to 20 members").optional().default([]),
  })
  .strict();

const createSplitRoomItemSchema = z
  .object({
    title: safeTextSchema("Item name", 120),
    amount: moneyAmountSchema(maxSplitRoomItemAmount),
    assignedMemberId: z.string().trim().uuid("Invalid assigned member"),
  })
  .strict();

const updateSplitRoomItemSchema = z
  .object({
    title: safeTextSchema("Item name", 120),
    amount: moneyAmountSchema(maxSplitRoomItemAmount),
  })
  .strict();

const paymentStatusSchema = z
  .object({
    paymentStatus: z.enum(["no_one_paid", "all_paid", "complete"]),
  })
  .strict();

const walletPaymentSchema = z
  .object({
    walletPin: z
      .string({ message: "Wallet PIN is required" })
      .trim()
      .regex(/^\d{4,6}$/, "Wallet PIN must be 4 to 6 digits"),
  })
  .strict();

const netSettlementPaymentSchema = z
  .object({
    toUserId: z.string().trim().uuid("Invalid settlement receiver"),
    walletPin: z
      .string({ message: "Wallet PIN is required" })
      .trim()
      .regex(/^\d{4,6}$/, "Wallet PIN must be 4 to 6 digits"),
  })
  .strict();
let splitRoomTablesReady: Promise<void> | null = null;
let netSettlementTablesReady: Promise<void> | null = null;

type DbUserRow = {
  id: string;
  name: string | null;
  email: string;
};

type RoomMemberRow = {
  id: string;
  room_id: string;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  photo_url?: string | null;
  profile_photo_url?: string | null;
  avatar_mode?: "photo" | "initials" | null;
  display_photo_url?: string | null;
  role: string;
  status: string;
};

type RoomItemRow = {
  id: string;
  room_id: string;
  assigned_member_id: string;
  title: string;
  amount: number;
  settled_amount?: number;
  pending_amount?: number;
  collected_at: string | null;
  expense_id: string | null;
  created_at: string;
};

type NetDebtLineRow = {
  item_id: string;
  room_id: string;
  room_name: string;
  item_title: string;
  original_amount: number;
  settled_amount: number;
  pending_amount: number;
  debtor_user_id: string;
  debtor_name: string | null;
  debtor_email: string;
  creditor_user_id: string;
  creditor_name: string | null;
  creditor_email: string;
  created_at: string;
};

type NetSettlementBreakdown = {
  itemId: string;
  roomId: string;
  roomName: string;
  title: string;
  direction: string;
  amount: number;
  originalAmount: number;
  settledAmount: number;
  createdAt: string;
};

type NetSettlementResponseItem = {
  fromUserId: string;
  fromName: string | null;
  fromEmail: string;
  toUserId: string;
  toName: string | null;
  toEmail: string;
  amount: number;
  currency: "INR";
  isOutgoing: boolean;
  isIncoming: boolean;
  breakdown: NetSettlementBreakdown[];
};

type RoomPaymentStatus = "no_one_paid" | "all_paid" | "complete";

type Queryable = {
  query: typeof db.query;
};

type SplitRoomMemberInsertRow = {
  roomId: string;
  userId: string | null;
  displayName: string | null;
  email: string | null;
  role: "owner" | "member";
  status: "active" | "invited";
};

function chunkArray<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

async function getRoomUserIds(roomId: string) {
  const result = await db.query<{ user_id: string | null }>(
    `
    SELECT DISTINCT user_id
    FROM split_room_members
    WHERE room_id = $1
    AND user_id IS NOT NULL;
    `,
    [roomId],
  );

  return result.rows.map((row) => row.user_id);
}

async function ensureSplitRoomTables() {
  // Table creation is handled by migrations. Keep this legacy setup disabled in normal requests.
  if (process.env.ENABLE_LEGACY_ROUTE_TABLE_SETUP !== "true") {
    return;
  }

  await db.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS split_rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT,
      payment_status TEXT NOT NULL DEFAULT 'no_one_paid',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE split_rooms
      ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'no_one_paid';

    CREATE TABLE IF NOT EXISTS split_room_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID NOT NULL REFERENCES split_rooms(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      display_name TEXT,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS split_room_members_room_email_idx
      ON split_room_members (room_id, LOWER(email))
      WHERE email IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS split_room_members_room_user_idx
      ON split_room_members (room_id, user_id)
      WHERE user_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS split_room_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID NOT NULL REFERENCES split_rooms(id) ON DELETE CASCADE,
      assigned_member_id UUID NOT NULL REFERENCES split_room_members(id) ON DELETE CASCADE,
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      collected_at TIMESTAMP,
      expense_id UUID,
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE split_room_items
      ADD COLUMN IF NOT EXISTS collected_at TIMESTAMP;

    ALTER TABLE split_room_items
      ADD COLUMN IF NOT EXISTS expense_id UUID;
  `);
}

async function ensureSplitRoomTablesOnce() {
  splitRoomTablesReady ??= ensureSplitRoomTables().catch((error) => {
    splitRoomTablesReady = null;
    throw error;
  });

  return splitRoomTablesReady;
}


async function ensureNetSettlementTables() {
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS split_room_item_settlements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id UUID NOT NULL REFERENCES split_room_items(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      method TEXT NOT NULL CHECK (method IN ('wallet', 'manual', 'offset')),
      counter_item_id UUID REFERENCES split_room_items(id) ON DELETE SET NULL,
      wallet_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS split_room_item_settlements_item_idx
      ON split_room_item_settlements (item_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS split_room_item_settlements_counter_item_idx
      ON split_room_item_settlements (counter_item_id)
      WHERE counter_item_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS split_room_item_settlements_method_created_idx
      ON split_room_item_settlements (method, created_at DESC);
  `);
}

async function ensureNetSettlementTablesOnce() {
  netSettlementTablesReady ??= ensureNetSettlementTables().catch((error) => {
    netSettlementTablesReady = null;
    throw error;
  });

  return netSettlementTablesReady;
}

function roundMoneyValue(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function getPersonLabel(name: string | null, email: string) {
  return name?.trim() || email.split("@")[0] || "Member";
}

function getDebtLineQuery({
  currentUserOnly = false,
  pairOnly = false,
  forUpdate = false,
} = {}) {
  const filters: string[] = [
    "item.collected_at IS NULL",
    "COALESCE(assigned_user.id, member.user_id) IS NOT NULL",
    "room.owner_user_id <> COALESCE(assigned_user.id, member.user_id)",
  ];

  if (currentUserOnly) {
    filters.push(
      "(room.owner_user_id = $1 OR COALESCE(assigned_user.id, member.user_id) = $1)",
    );
  }

  if (pairOnly) {
    filters.push(`
      (
        (room.owner_user_id = $1 AND COALESCE(assigned_user.id, member.user_id) = $2)
        OR
        (room.owner_user_id = $2 AND COALESCE(assigned_user.id, member.user_id) = $1)
      )
    `);
  }

  return `
    WITH settled AS (
      SELECT
        item_id,
        COALESCE(SUM(amount), 0) AS settled_amount
      FROM split_room_item_settlements
      GROUP BY item_id
    ),
    debt_lines AS (
      SELECT
        item.id AS item_id,
        item.room_id,
        room.name AS room_name,
        item.title AS item_title,
        item.amount::float AS original_amount,
        COALESCE(settled.settled_amount, 0)::float AS settled_amount,
        GREATEST(item.amount - COALESCE(settled.settled_amount, 0), 0)::float AS pending_amount,
        COALESCE(assigned_user.id, member.user_id) AS debtor_user_id,
        COALESCE(assigned_user.name, member.display_name) AS debtor_name,
        COALESCE(assigned_user.email, member.email) AS debtor_email,
        owner_user.id AS creditor_user_id,
        owner_user.name AS creditor_name,
        owner_user.email AS creditor_email,
        item.created_at
      FROM split_room_items item
      INNER JOIN split_room_members member
        ON member.id = item.assigned_member_id
      INNER JOIN split_rooms room
        ON room.id = item.room_id
      INNER JOIN users owner_user
        ON owner_user.id = room.owner_user_id
      LEFT JOIN users assigned_user
        ON assigned_user.id = member.user_id
        OR (
          member.user_id IS NULL
          AND member.email IS NOT NULL
          AND LOWER(assigned_user.email) = LOWER(member.email)
        )
      LEFT JOIN settled
        ON settled.item_id = item.id
      WHERE ${filters.join("\n      AND ")}
      ${forUpdate ? "FOR UPDATE OF item" : ""}
    )
    SELECT *
    FROM debt_lines
    WHERE pending_amount > 0
    ORDER BY created_at ASC;
  `;
}

async function loadNetDebtLines(
  client: Queryable,
  currentUserId: string,
) {
  const result = await client.query<NetDebtLineRow>(
    getDebtLineQuery({ currentUserOnly: true }),
    [currentUserId],
  );

  return result.rows.map((line) => ({
    ...line,
    original_amount: Number(line.original_amount),
    settled_amount: Number(line.settled_amount),
    pending_amount: Number(line.pending_amount),
  }));
}

async function loadPairDebtLines(
  client: Queryable,
  leftUserId: string,
  rightUserId: string,
  { forUpdate = false } = {},
) {
  const result = await client.query<NetDebtLineRow>(
    getDebtLineQuery({ pairOnly: true, forUpdate }),
    [leftUserId, rightUserId],
  );

  return result.rows.map((line) => ({
    ...line,
    original_amount: Number(line.original_amount),
    settled_amount: Number(line.settled_amount),
    pending_amount: Number(line.pending_amount),
  }));
}

function serializeNetSettlements(
  debtLines: NetDebtLineRow[],
  currentUserId: string,
) {
  const pairMap = new Map<
    string,
    {
      userA: string;
      userB: string;
      netAmount: number;
      userDetails: Map<string, { name: string | null; email: string }>;
      breakdown: NetSettlementBreakdown[];
    }
  >();

  for (const line of debtLines) {
    if (!line.debtor_user_id || !line.creditor_user_id) {
      continue;
    }

    if (line.debtor_user_id === line.creditor_user_id) {
      continue;
    }

    const [userA, userB] = [line.debtor_user_id, line.creditor_user_id].sort();
    const pairKey = `${userA}:${userB}`;
    const direction = line.debtor_user_id === userA ? 1 : -1;
    const existing = pairMap.get(pairKey) ?? {
      userA,
      userB,
      netAmount: 0,
      userDetails: new Map<string, { name: string | null; email: string }>(),
      breakdown: [],
    };

    existing.netAmount += line.pending_amount * direction;
    existing.userDetails.set(line.debtor_user_id, {
      name: line.debtor_name,
      email: line.debtor_email,
    });
    existing.userDetails.set(line.creditor_user_id, {
      name: line.creditor_name,
      email: line.creditor_email,
    });
    existing.breakdown.push({
      itemId: line.item_id,
      roomId: line.room_id,
      roomName: line.room_name,
      title: line.item_title,
      direction: `${getPersonLabel(line.debtor_name, line.debtor_email)} owes ${getPersonLabel(line.creditor_name, line.creditor_email)}`,
      amount: roundMoneyValue(line.pending_amount),
      originalAmount: roundMoneyValue(line.original_amount),
      settledAmount: roundMoneyValue(line.settled_amount),
      createdAt: line.created_at,
    });

    pairMap.set(pairKey, existing);
  }

  return Array.from(pairMap.values())
    .map((pair): NetSettlementResponseItem | null => {
      const netAmount = roundMoneyValue(pair.netAmount);

      if (Math.abs(netAmount) < 0.01) {
        return null;
      }

      const fromUserId = netAmount > 0 ? pair.userA : pair.userB;
      const toUserId = netAmount > 0 ? pair.userB : pair.userA;
      const fromDetails = pair.userDetails.get(fromUserId);
      const toDetails = pair.userDetails.get(toUserId);

      if (!fromDetails || !toDetails) {
        return null;
      }

      return {
        fromUserId,
        fromName: fromDetails.name,
        fromEmail: fromDetails.email,
        toUserId,
        toName: toDetails.name,
        toEmail: toDetails.email,
        amount: Math.abs(netAmount),
        currency: "INR",
        isOutgoing: fromUserId === currentUserId,
        isIncoming: toUserId === currentUserId,
        breakdown: pair.breakdown.sort(
          (left, right) =>
            new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
        ),
      };
    })
    .filter((settlement): settlement is NetSettlementResponseItem => Boolean(settlement))
    .sort((left, right) => {
      if (left.isOutgoing !== right.isOutgoing) {
        return left.isOutgoing ? -1 : 1;
      }

      return right.amount - left.amount;
    });
}

async function insertItemSettlement(
  client: Queryable,
  {
    itemId,
    amount,
    method,
    createdByUserId,
    counterItemId = null,
    walletTransactionId = null,
  }: {
    itemId: string;
    amount: number;
    method: "wallet" | "manual" | "offset";
    createdByUserId: string;
    counterItemId?: string | null;
    walletTransactionId?: string | null;
  },
) {
  await client.query(
    `
    INSERT INTO split_room_item_settlements (
      item_id,
      amount,
      method,
      counter_item_id,
      wallet_transaction_id,
      created_by_user_id
    )
    VALUES ($1, $2, $3, $4, $5, $6);
    `,
    [itemId, amount, method, counterItemId, walletTransactionId, createdByUserId],
  );
}

async function markFullySettledItemsCollected(client: Queryable, itemIds: string[]) {
  const uniqueItemIds = [...new Set(itemIds)].filter(Boolean);

  if (uniqueItemIds.length === 0) {
    return [];
  }

  const result = await client.query<{ id: string; room_id: string }>(
    `
    UPDATE split_room_items item
    SET collected_at = COALESCE(item.collected_at, NOW())
    WHERE item.id = ANY($1::uuid[])
    AND item.collected_at IS NULL
    AND item.amount <= COALESCE((
      SELECT SUM(settlement.amount)
      FROM split_room_item_settlements settlement
      WHERE settlement.item_id = item.id
    ), 0)
    RETURNING item.id, item.room_id;
    `,
    [uniqueItemIds],
  );

  return result.rows;
}

async function refreshRoomPaymentStatuses(client: Queryable, roomIds: string[]) {
  const uniqueRoomIds = [...new Set(roomIds)].filter(Boolean);

  if (uniqueRoomIds.length === 0) {
    return;
  }

  await client.query(
    `
    WITH settled AS (
      SELECT item_id, COALESCE(SUM(amount), 0) AS settled_amount
      FROM split_room_item_settlements
      GROUP BY item_id
    )
    UPDATE split_rooms room
    SET
      payment_status = CASE
        WHEN room.payment_status = 'complete' THEN room.payment_status
        WHEN NOT EXISTS (
          SELECT 1
          FROM split_room_items item
          INNER JOIN split_room_members member
            ON member.id = item.assigned_member_id
          WHERE item.room_id = room.id
          AND item.collected_at IS NULL
          AND GREATEST(item.amount - COALESCE((
            SELECT settled.settled_amount
            FROM settled
            WHERE settled.item_id = item.id
          ), 0), 0) > 0
          AND NOT (
            member.user_id = room.owner_user_id
            OR LOWER(COALESCE(member.email, '')) = LOWER((
              SELECT owner_user.email
              FROM users owner_user
              WHERE owner_user.id = room.owner_user_id
            ))
          )
        ) THEN 'all_paid'
        ELSE room.payment_status
      END,
      updated_at = NOW()
    WHERE room.id = ANY($1::uuid[]);
    `,
    [uniqueRoomIds],
  );
}

async function applyOffsetSettlements(
  client: Queryable,
  forwardLines: NetDebtLineRow[],
  reverseLines: NetDebtLineRow[],
  amountToOffset: number,
  createdByUserId: string,
) {
  let remainingOffset = roundMoneyValue(amountToOffset);
  let forwardIndex = 0;
  let reverseIndex = 0;
  let forwardRemaining = forwardLines[0]?.pending_amount ?? 0;
  let reverseRemaining = reverseLines[0]?.pending_amount ?? 0;
  const touchedItemIds: string[] = [];

  while (remainingOffset > 0.009 && forwardLines[forwardIndex] && reverseLines[reverseIndex]) {
    const amount = roundMoneyValue(
      Math.min(remainingOffset, forwardRemaining, reverseRemaining),
    );
    const forwardLine = forwardLines[forwardIndex];
    const reverseLine = reverseLines[reverseIndex];

    await insertItemSettlement(client, {
      itemId: forwardLine.item_id,
      amount,
      method: "offset",
      counterItemId: reverseLine.item_id,
      createdByUserId,
    });
    await insertItemSettlement(client, {
      itemId: reverseLine.item_id,
      amount,
      method: "offset",
      counterItemId: forwardLine.item_id,
      createdByUserId,
    });

    touchedItemIds.push(forwardLine.item_id, reverseLine.item_id);
    remainingOffset = roundMoneyValue(remainingOffset - amount);
    forwardRemaining = roundMoneyValue(forwardRemaining - amount);
    reverseRemaining = roundMoneyValue(reverseRemaining - amount);
    forwardLine.pending_amount = forwardRemaining;
    reverseLine.pending_amount = reverseRemaining;

    if (forwardRemaining <= 0.009) {
      forwardIndex += 1;
      forwardRemaining = forwardLines[forwardIndex]?.pending_amount ?? 0;
    }

    if (reverseRemaining <= 0.009) {
      reverseIndex += 1;
      reverseRemaining = reverseLines[reverseIndex]?.pending_amount ?? 0;
    }
  }

  return touchedItemIds;
}


async function applyAutomaticNetOffsetsForUser(
  client: Queryable,
  currentUserId: string,
) {
  const visibleDebtLines = await loadNetDebtLines(client, currentUserId);
  const pairKeys = new Set<string>();

  for (const line of visibleDebtLines) {
    if (!line.debtor_user_id || !line.creditor_user_id) {
      continue;
    }

    if (line.debtor_user_id === line.creditor_user_id) {
      continue;
    }

    const [userA, userB] = [line.debtor_user_id, line.creditor_user_id].sort();
    pairKeys.add(`${userA}:${userB}`);
  }

  const touchedItemIds: string[] = [];
  const affectedUserIds = new Set<string>();

  for (const pairKey of pairKeys) {
    const [userA, userB] = pairKey.split(":");

    if (!userA || !userB) {
      continue;
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text));", [
      pairKey,
    ]);

    const pairDebtLines = await loadPairDebtLines(client, userA, userB, {
      forUpdate: true,
    });
    const userAOwesUserB = pairDebtLines.filter(
      (line) => line.debtor_user_id === userA && line.creditor_user_id === userB,
    );
    const userBOwesUserA = pairDebtLines.filter(
      (line) => line.debtor_user_id === userB && line.creditor_user_id === userA,
    );
    const userAOwesTotal = roundMoneyValue(
      userAOwesUserB.reduce((sum, line) => sum + line.pending_amount, 0),
    );
    const userBOwesTotal = roundMoneyValue(
      userBOwesUserA.reduce((sum, line) => sum + line.pending_amount, 0),
    );
    const offsetAmount = roundMoneyValue(Math.min(userAOwesTotal, userBOwesTotal));

    if (offsetAmount <= 0.009) {
      continue;
    }

    touchedItemIds.push(
      ...(await applyOffsetSettlements(
        client,
        userAOwesUserB,
        userBOwesUserA,
        offsetAmount,
        currentUserId,
      )),
    );
    affectedUserIds.add(userA);
    affectedUserIds.add(userB);
  }

  const collectedItems = await markFullySettledItemsCollected(client, touchedItemIds);
  const touchedRoomIds = collectedItems.map((item) => item.room_id);
  await refreshRoomPaymentStatuses(client, touchedRoomIds);

  return {
    affectedUserIds: Array.from(affectedUserIds),
    touchedItemIds: [...new Set(touchedItemIds)],
    touchedRoomIds: [...new Set(touchedRoomIds)],
  };
}

async function applyAutomaticNetOffsetsForUserInTransaction(
  currentUserId: string,
) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const result = await applyAutomaticNetOffsetsForUser(client, currentUserId);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}


async function getVisibleSettlementUserIds(
  client: Queryable,
  currentUserId: string,
  currentUserEmail: string,
) {
  const result = await client.query<{ id: string }>(
    `
    WITH visible_rooms AS (
      SELECT DISTINCT room.id
      FROM split_rooms room
      INNER JOIN split_room_members current_member
        ON current_member.room_id = room.id
      WHERE room.owner_user_id = $1
      OR current_member.user_id = $1
      OR LOWER(COALESCE(current_member.email, '')) = LOWER($2)
    ),
    room_people AS (
      SELECT room.owner_user_id AS user_id
      FROM split_rooms room
      INNER JOIN visible_rooms visible
        ON visible.id = room.id

      UNION

      SELECT COALESCE(member.user_id, email_user.id) AS user_id
      FROM split_room_members member
      INNER JOIN visible_rooms visible
        ON visible.id = member.room_id
      LEFT JOIN users email_user
        ON member.user_id IS NULL
        AND member.email IS NOT NULL
        AND LOWER(email_user.email) = LOWER(member.email)
    )
    SELECT DISTINCT user_id AS id
    FROM room_people
    WHERE user_id IS NOT NULL;
    `,
    [currentUserId, currentUserEmail],
  );

  return result.rows.map((row) => row.id);
}

async function applyAutomaticNetOffsetsForVisibleRoomsInTransaction(
  currentUserId: string,
  currentUserEmail: string,
) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const scopeUserIds = await getVisibleSettlementUserIds(
      client,
      currentUserId,
      currentUserEmail,
    );
    const affectedUserIds = new Set<string>();
    const touchedItemIds = new Set<string>();
    const touchedRoomIds = new Set<string>();

    for (const userId of scopeUserIds) {
      const result = await applyAutomaticNetOffsetsForUser(client, userId);
      result.affectedUserIds.forEach((id) => affectedUserIds.add(id));
      result.touchedItemIds.forEach((id) => touchedItemIds.add(id));
      result.touchedRoomIds.forEach((id) => touchedRoomIds.add(id));
    }

    await client.query("COMMIT");

    return {
      affectedUserIds: Array.from(affectedUserIds),
      touchedItemIds: Array.from(touchedItemIds),
      touchedRoomIds: Array.from(touchedRoomIds),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function applyWalletSettlement(
  client: Queryable,
  lines: NetDebtLineRow[],
  amountToSettle: number,
  createdByUserId: string,
  walletTransactionId: string,
) {
  let remaining = roundMoneyValue(amountToSettle);
  const touchedItemIds: string[] = [];

  for (const line of lines) {
    if (remaining <= 0.009) {
      break;
    }

    if (line.pending_amount <= 0.009) {
      continue;
    }

    const amount = roundMoneyValue(Math.min(remaining, line.pending_amount));

    if (amount <= 0.009) {
      continue;
    }

    await insertItemSettlement(client, {
      itemId: line.item_id,
      amount,
      method: "wallet",
      createdByUserId,
      walletTransactionId,
    });

    touchedItemIds.push(line.item_id);
    remaining = roundMoneyValue(remaining - amount);
  }

  return touchedItemIds;
}

async function getCurrentUser(firebaseUid: string) {
  const result = await db.query<DbUserRow>(
    `
    SELECT id, name, email
    FROM users
    WHERE firebase_uid = $1;
    `,
    [firebaseUid],
  );

  return result.rows[0] ?? null;
}

function parseMembers(rawMembers: unknown) {
  if (!Array.isArray(rawMembers)) {
    return [];
  }

  return rawMembers
    .map((member) => String(member ?? "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function memberToIdentity(member: string) {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member);

  return {
    displayName: isEmail ? member.split("@")[0] : member,
    email: isEmail ? member.toLowerCase() : null,
  };
}

async function findUsersByEmail(client: Queryable, emails: string[]) {
  if (emails.length === 0) {
    return new Map<string, DbUserRow>();
  }

  const result = await client.query<DbUserRow>(
    `
    SELECT id, name, email
    FROM users
    WHERE LOWER(email) = ANY($1::text[]);
    `,
    [emails],
  );

  return new Map(
    result.rows.map((user) => [user.email.toLowerCase(), user] as const),
  );
}

async function insertSplitRoomMembers(
  client: Queryable,
  rows: SplitRoomMemberInsertRow[],
) {
  for (const chunk of chunkArray(rows, splitRoomMemberInsertChunkSize)) {
    const values: Array<string | null> = [];
    const placeholders = chunk
      .map((row, rowIndex) => {
        const paramIndex = rowIndex * 6;

        values.push(
          row.roomId,
          row.userId,
          row.displayName,
          row.email,
          row.role,
          row.status,
        );

        return `($${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`;
      })
      .join(",\n");

    await client.query(
      `
      INSERT INTO split_room_members (
        room_id,
        user_id,
        display_name,
        email,
        role,
        status
      )
      VALUES ${placeholders}
      ON CONFLICT DO NOTHING;
      `,
      values,
    );
  }
}

function serializeRoom(
  room: {
    id: string;
    owner_user_id: string;
    name: string;
    category: string | null;
    payment_status: RoomPaymentStatus | string | null;
    created_at: string;
  },
  members: RoomMemberRow[],
  items: RoomItemRow[],
  currentUser: DbUserRow,
) {
  const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const itemCountByMember = new Map<string, number>();
  const amountByMember = new Map<string, number>();
  const outstandingByMember = new Map<string, number>();
  const collectedByMember = new Map<string, number>();
  const serializedMembers = members.map((member) => {
    const avatarMode = member.avatar_mode === "initials" ? "initials" : "photo";

    return {
      ...member,
      avatar_mode: avatarMode,
      display_photo_url:
        avatarMode === "initials"
          ? null
          : member.display_photo_url ||
            member.profile_photo_url ||
            member.photo_url ||
            null,
      isMe:
        member.user_id === currentUser.id ||
        member.email?.toLowerCase() === currentUser.email.toLowerCase(),
      isOwner: member.role === "owner",
    };
  });
  const memberById = new Map(
    serializedMembers.map((member) => [member.id, member]),
  );

  items.forEach((item) => {
    const member = memberById.get(item.assigned_member_id);
    const amount = Number(item.amount);
    const pendingAmount = item.collected_at
      ? 0
      : Math.max(Number(item.pending_amount ?? amount), 0);
    const settledAmount = Math.max(amount - pendingAmount, Number(item.settled_amount ?? 0));

    itemCountByMember.set(
      item.assigned_member_id,
      (itemCountByMember.get(item.assigned_member_id) ?? 0) + 1,
    );
    amountByMember.set(
      item.assigned_member_id,
      (amountByMember.get(item.assigned_member_id) ?? 0) + amount,
    );

    if (!member?.isMe) {
      if (settledAmount > 0) {
        collectedByMember.set(
          item.assigned_member_id,
          (collectedByMember.get(item.assigned_member_id) ?? 0) + settledAmount,
        );
      }

      if (pendingAmount > 0) {
        outstandingByMember.set(
          item.assigned_member_id,
          (outstandingByMember.get(item.assigned_member_id) ?? 0) + pendingAmount,
        );
      }
    }
  });

  const outstandingAmount = Array.from(outstandingByMember.values()).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const collectedAmount = Array.from(collectedByMember.values()).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const paymentStatus = normalizePaymentStatus(room.payment_status);
  const statusLabel =
    paymentStatus === "complete"
      ? "Complete"
      : paymentStatus === "all_paid"
        ? "All paid"
        : items.length === 0
          ? "New"
          : "No one paid";

  return {
    ...room,
    paymentStatus,
    isOwner: room.owner_user_id === currentUser.id,
    memberCount: members.length,
    totalAmount: total,
    outstandingAmount,
    collectedAmount,
    status: statusLabel,
    members: serializedMembers,
    balances: serializedMembers.map((member) => {
      const amount = amountByMember.get(member.id) ?? 0;
      const outstandingAmountForMember =
        outstandingByMember.get(member.id) ?? 0;
      const collectedAmountForMember = collectedByMember.get(member.id) ?? 0;

      return {
        memberId: member.id,
        name: member.isMe ? "Me" : member.display_name || member.email,
        detail: member.isMe
          ? "Your spend"
          : outstandingAmountForMember > 0
            ? "Dues pending"
            : collectedAmountForMember > 0
              ? "Collected"
              : "No dues yet",
        amount,
        outstandingAmount: outstandingAmountForMember,
        collectedAmount: collectedAmountForMember,
        isMe: member.isMe,
        isCollected:
          !member.isMe && amount > 0 && outstandingAmountForMember === 0,
        itemCount: itemCountByMember.get(member.id) ?? 0,
      };
    }),
    items: items.map((item) => {
      const amount = Number(item.amount);
      const pendingAmount = item.collected_at
        ? 0
        : Math.max(Number(item.pending_amount ?? amount), 0);
      const settledAmount = Math.max(amount - pendingAmount, Number(item.settled_amount ?? 0));

      return {
        ...item,
        amount,
        settledAmount,
        pendingAmount,
        isCollected: Boolean(item.collected_at) || pendingAmount <= 0,
      };
    }),
  };
}

function normalizePaymentStatus(status: unknown): RoomPaymentStatus {
  if (status === "all_paid" || status === "complete") {
    return status;
  }

  return "no_one_paid";
}

function getRouteParam(req: AuthRequest, paramName: string) {
  const value = req.params[paramName];

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

router.get("/", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    await ensureSplitRoomTablesOnce();
    await ensureNetSettlementTablesOnce();

    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const dbUser = await getCurrentUser(firebaseUser.uid);

    if (!dbUser) {
      return res.status(404).json({ message: "User not found in database" });
    }

    const offsetResult = await applyAutomaticNetOffsetsForVisibleRoomsInTransaction(
      dbUser.id,
      dbUser.email,
    );

    if (offsetResult.affectedUserIds.length > 0) {
      sendLiveUpdate(offsetResult.affectedUserIds, {
        type: "split-room",
        reason: "net-settlement-adjusted",
      });
    }

    const roomResult = await db.query(
      `
      SELECT DISTINCT
        room.id,
        room.owner_user_id,
        room.name,
        room.category,
        room.payment_status,
        room.created_at
      FROM split_rooms room
      INNER JOIN split_room_members member
        ON member.room_id = room.id
      WHERE room.owner_user_id = $1
      OR member.user_id = $1
      OR LOWER(member.email) = LOWER($2)
      ORDER BY room.created_at DESC;
      `,
      [dbUser.id, dbUser.email],
    );

    const roomIds = roomResult.rows.map((room) => room.id);

    if (roomIds.length === 0) {
      return res.json({ rooms: [] });
    }

    const [memberResult, itemResult] = await Promise.all([
      db.query<RoomMemberRow>(
        `
        SELECT
          member.id,
          member.room_id,
          COALESCE(member.user_id, user_profile.id) AS user_id,
          COALESCE(member.display_name, user_profile.name) AS display_name,
          COALESCE(member.email, user_profile.email) AS email,
          user_profile.photo_url,
          user_profile.profile_photo_url,
          COALESCE(user_profile.avatar_mode, 'photo') AS avatar_mode,
          CASE
            WHEN user_profile.avatar_mode = 'initials' THEN NULL
            ELSE COALESCE(user_profile.profile_photo_url, user_profile.photo_url)
          END AS display_photo_url,
          member.role,
          member.status
        FROM split_room_members member
        LEFT JOIN users user_profile
          ON user_profile.id = member.user_id
          OR (member.user_id IS NULL AND LOWER(user_profile.email) = LOWER(member.email))
        WHERE member.room_id = ANY($1::uuid[])
        ORDER BY member.created_at ASC;
        `,
        [roomIds],
      ),
      db.query<RoomItemRow>(
        `
        SELECT
          item.id,
          item.room_id,
          item.assigned_member_id,
          item.title,
          item.amount::float,
          COALESCE(settled.settled_amount, 0)::float AS settled_amount,
          GREATEST(item.amount - COALESCE(settled.settled_amount, 0), 0)::float AS pending_amount,
          item.collected_at,
          item.expense_id,
          item.created_at
        FROM split_room_items item
        LEFT JOIN (
          SELECT item_id, COALESCE(SUM(amount), 0) AS settled_amount
          FROM split_room_item_settlements
          GROUP BY item_id
        ) settled
          ON settled.item_id = item.id
        WHERE item.room_id = ANY($1::uuid[])
        ORDER BY item.created_at DESC;
        `,
        [roomIds],
      ),
    ]);

    const rooms = roomResult.rows.map((room) =>
      serializeRoom(
        room,
        memberResult.rows.filter((member) => member.room_id === room.id),
        itemResult.rows.filter((item) => item.room_id === room.id),
        dbUser,
      ),
    );

    return res.json({ rooms });
  } catch (error) {
    console.error("Load split rooms failed:", error);

    return res.status(500).json({
      message: "Failed to load split rooms",
    });
  }
});


router.get(
  "/net-settlements",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      await ensureSplitRoomTablesOnce();
      await ensureNetSettlementTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const offsetResult = await applyAutomaticNetOffsetsForUserInTransaction(dbUser.id);

      if (offsetResult.affectedUserIds.length > 0) {
        sendLiveUpdate(offsetResult.affectedUserIds, {
          type: "split-room",
          reason: "net-settlement-adjusted",
        });
      }

      const debtLines = await loadNetDebtLines(db, dbUser.id);
      const settlements = serializeNetSettlements(debtLines, dbUser.id);
      const outgoingTotal = settlements
        .filter((settlement) => settlement.isOutgoing)
        .reduce((sum, settlement) => sum + settlement.amount, 0);
      const incomingTotal = settlements
        .filter((settlement) => settlement.isIncoming)
        .reduce((sum, settlement) => sum + settlement.amount, 0);

      return res.json({
        settlements,
        summary: {
          outgoingTotal: roundMoneyValue(outgoingTotal),
          incomingTotal: roundMoneyValue(incomingTotal),
          netPosition: roundMoneyValue(incomingTotal - outgoingTotal),
          currency: "INR",
        },
      });
    } catch (error) {
      console.error("Load adjusted settlements failed:", error);

      return res.status(500).json({
        message: "Failed to load adjusted settlements",
      });
    }
  },
);

router.post(
  "/net-settlements/pay",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      await ensureSplitRoomTablesOnce();
      await ensureNetSettlementTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { toUserId, walletPin } = parseRequestBody(
        netSettlementPaymentSchema,
        req.body,
      );

      await client.query("BEGIN");

      const payerResult = await client.query<DbUserRow>(
        `
        SELECT id, name, email
        FROM users
        WHERE firebase_uid = $1
        FOR UPDATE;
        `,
        [firebaseUser.uid],
      );
      const payer = payerResult.rows[0];

      if (!payer) {
        await client.query("ROLLBACK");

        return res.status(404).json({ message: "User not found in database" });
      }

      if (payer.id === toUserId) {
        await client.query("ROLLBACK");

        return res.status(400).json({ message: "You cannot pay yourself" });
      }

      const receiverResult = await client.query<DbUserRow>(
        `
        SELECT id, name, email
        FROM users
        WHERE id = $1
        FOR UPDATE;
        `,
        [toUserId],
      );
      const receiver = receiverResult.rows[0];

      if (!receiver) {
        await client.query("ROLLBACK");

        return res.status(404).json({ message: "Settlement receiver not found" });
      }

      const [leftLockId, rightLockId] = [payer.id, receiver.id].sort();
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text));", [
        `${leftLockId}:${rightLockId}`,
      ]);

      try {
        await verifyWalletPinForUser(client, payer.id, walletPin);
      } catch (pinError) {
        await client.query("COMMIT");

        if (sendWalletPinError(res, pinError)) {
          return;
        }

        throw pinError;
      }

      const pairDebtLines = await loadPairDebtLines(client, payer.id, receiver.id, {
        forUpdate: true,
      });
      const payerOwesReceiver = pairDebtLines.filter(
        (line) => line.debtor_user_id === payer.id && line.creditor_user_id === receiver.id,
      );
      const receiverOwesPayer = pairDebtLines.filter(
        (line) => line.debtor_user_id === receiver.id && line.creditor_user_id === payer.id,
      );
      const payerOwesTotal = roundMoneyValue(
        payerOwesReceiver.reduce((sum, line) => sum + line.pending_amount, 0),
      );
      const receiverOwesTotal = roundMoneyValue(
        receiverOwesPayer.reduce((sum, line) => sum + line.pending_amount, 0),
      );
      const netAmount = roundMoneyValue(payerOwesTotal - receiverOwesTotal);

      if (netAmount <= 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "You do not owe this person anything after adjustment",
        });
      }

      const balanceResult = await client.query(
        `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN type = 'credit' THEN amount
                WHEN type = 'debit' THEN -amount
                ELSE 0
              END
            )::float,
            0
          ) AS wallet_balance
        FROM wallet_transactions
        WHERE user_id = $1;
        `,
        [payer.id],
      );
      const walletBalance = Number(balanceResult.rows[0].wallet_balance);

      if (walletBalance < netAmount) {
        await client.query("ROLLBACK");

        return res.status(400).json({ message: "Insufficient wallet balance" });
      }

      const touchedItemIds: string[] = [];
      const offsetAmount = roundMoneyValue(Math.min(payerOwesTotal, receiverOwesTotal));

      if (offsetAmount > 0) {
        touchedItemIds.push(
          ...(await applyOffsetSettlements(
            client,
            payerOwesReceiver,
            receiverOwesPayer,
            offsetAmount,
            payer.id,
          )),
        );
      }

      const walletTransactionResult = await client.query<{
        id: string;
        user_id: string;
        type: string;
      }>(
        `
        INSERT INTO wallet_transactions (
          user_id,
          type,
          amount,
          description
        )
        VALUES
          ($1, 'debit', $3, $4),
          ($2, 'credit', $3, $5)
        RETURNING id, user_id, type;
        `,
        [
          payer.id,
          receiver.id,
          netAmount,
          `Adjusted split settlement paid to ${getPersonLabel(receiver.name, receiver.email)}`,
          `Adjusted split settlement received from ${getPersonLabel(payer.name, payer.email)}`,
        ],
      );
      const debitWalletTransaction = walletTransactionResult.rows.find(
        (row) => row.user_id === payer.id && row.type === "debit",
      );

      if (!debitWalletTransaction) {
        throw new Error("Debit wallet transaction was not created");
      }

      const expenseResult = await client.query(
        `
        INSERT INTO expenses (
          user_id,
          title,
          category,
          amount,
          expense_date
        )
        VALUES (
          $1,
          $2,
          'Shared room',
          $3,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        )
        RETURNING id;
        `,
        [
          payer.id,
          `Adjusted split settlement to ${getPersonLabel(receiver.name, receiver.email)}`,
          netAmount,
        ],
      );

      touchedItemIds.push(
        ...(await applyWalletSettlement(
          client,
          payerOwesReceiver,
          netAmount,
          payer.id,
          debitWalletTransaction.id,
        )),
      );

      const collectedItems = await markFullySettledItemsCollected(client, touchedItemIds);
      await refreshRoomPaymentStatuses(
        client,
        collectedItems.map((item) => item.room_id),
      );

      await client.query("COMMIT");

      sendLiveUpdate([payer.id, receiver.id], {
        type: "money",
        reason: "net-settlement-paid",
      });

      return res.json({
        message: "Adjusted settlement paid successfully",
        settlement: {
          fromUserId: payer.id,
          toUserId: receiver.id,
          amount: netAmount,
          currency: "INR",
          offsetAmount,
          expenseId: expenseResult.rows[0].id,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);

      if (sendValidationError(res, error) || sendWalletPinError(res, error)) {
        return;
      }

      console.error("Pay adjusted settlement failed:", error);

      return res.status(500).json({
        message: "Failed to pay adjusted settlement",
      });
    } finally {
      client.release();
    }
  },
);

router.post("/", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const client = await db.connect();

  try {
    await ensureSplitRoomTablesOnce();

    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const dbUser = await getCurrentUser(firebaseUser.uid);

    if (!dbUser) {
      return res.status(404).json({ message: "User not found in database" });
    }

    const { name, category, members: suppliedMembers } = parseRequestBody(
      createSplitRoomSchema,
      req.body,
    );
    const members = parseMembers(suppliedMembers);

    const roomsCreatedTodayResult = await client.query(
      `
      SELECT COUNT(*)::int AS room_count
      FROM split_rooms
      WHERE owner_user_id = $1
      AND created_at::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
      `,
      [dbUser.id],
    );
    const roomsCreatedToday = Number(
      roomsCreatedTodayResult.rows[0].room_count,
    );

    if (roomsCreatedToday >= maxSplitRoomsPerDay) {
      return res.status(429).json({
        message: "You can create up to 10 split rooms per day",
      });
    }

    await client.query("BEGIN");

    const roomResult = await client.query<{
      id: string;
      name: string;
      category: string | null;
      payment_status: RoomPaymentStatus;
      created_at: string;
    }>(
      `
      INSERT INTO split_rooms (owner_user_id, name, category, payment_status)
      VALUES ($1, $2, $3, 'no_one_paid')
      RETURNING id, name, category, payment_status, created_at;
      `,
      [dbUser.id, name, category || "general"],
    );

    const room = roomResult.rows[0];

    const memberIdentities = members
      .map(memberToIdentity)
      .filter((identity) => identity.email !== dbUser.email.toLowerCase());
    const memberEmails = [
      ...new Set(
        memberIdentities
          .map((identity) => identity.email)
          .filter((email): email is string => Boolean(email)),
      ),
    ];
    const usersByEmail = await findUsersByEmail(client, memberEmails);
    const memberRows: SplitRoomMemberInsertRow[] = [
      {
        roomId: room.id,
        userId: dbUser.id,
        displayName: dbUser.name || "Me",
        email: dbUser.email,
        role: "owner",
        status: "active",
      },
      ...memberIdentities.map((identity) => {
        const matchedUser = identity.email
          ? (usersByEmail.get(identity.email) as DbUserRow | undefined)
          : null;

        return {
          roomId: room.id,
          userId: matchedUser?.id ?? null,
          displayName: matchedUser?.name || identity.displayName,
          email: matchedUser?.email || identity.email,
          role: "member" as const,
          status: matchedUser ? ("active" as const) : ("invited" as const),
        };
      }),
    ];

    await insertSplitRoomMembers(client, memberRows);

    await client.query("COMMIT");

    const notifiedUserIds = await getRoomUserIds(room.id);
    sendLiveUpdate([dbUser.id, ...notifiedUserIds], {
      type: "split-room",
      reason: "room-created",
      roomId: room.id,
    });

    return res.status(201).json({
      message: "Split room created",
      room,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (sendValidationError(res, error)) {
      return;
    }

    console.error("Create split room failed:", error);

    return res.status(500).json({
      message: "Failed to create split room",
    });
  } finally {
    client.release();
  }
});

router.post(
  "/:roomId/items",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      await ensureSplitRoomTablesOnce();
      await ensureNetSettlementTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const roomId = getRouteParam(req, "roomId");
      const { title, assignedMemberId, amount } = parseRequestBody(
        createSplitRoomItemSchema,
        req.body,
      );

      if (!roomId) {
        return res.status(400).json({ message: "Room id is required" });
      }

      const accessResult = await db.query(
        `
      SELECT room.id, room.name
      FROM split_rooms room
      WHERE room.id = $1
      AND room.owner_user_id = $2
      LIMIT 1;
      `,
        [roomId, dbUser.id],
      );

      if (accessResult.rows.length === 0) {
        return res.status(403).json({
          message: "Only the room owner can add items to this room",
        });
      }

      const assignedMemberResult = await db.query<RoomMemberRow>(
        `
      SELECT id, room_id, user_id, display_name, email, role, status
      FROM split_room_members
      WHERE id = $1
      AND room_id = $2;
      `,
        [assignedMemberId, roomId],
      );

      if (assignedMemberResult.rows.length === 0) {
        return res
          .status(400)
          .json({ message: "Assigned member is not in this room" });
      }

      const assignedMember = assignedMemberResult.rows[0];
      const isAssignedToCurrentUser =
        assignedMember.user_id === dbUser.id ||
        assignedMember.email?.toLowerCase() === dbUser.email.toLowerCase();

      const itemResult = await db.query(
        `
      INSERT INTO split_room_items (
        room_id,
        assigned_member_id,
        created_by_user_id,
        title,
        amount,
        collected_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        room_id,
        assigned_member_id,
        title,
        amount::float,
        collected_at,
        expense_id,
        created_at;
      `,
        [
          roomId,
          assignedMemberId,
          dbUser.id,
          title,
          amount,
          isAssignedToCurrentUser ? new Date() : null,
        ],
      );

      if (isAssignedToCurrentUser) {
        const expenseResult = await db.query(
          `
        INSERT INTO expenses (
          user_id,
          title,
          category,
          amount,
          expense_date
        )
        VALUES (
          $1,
          $2,
          'Shared room',
          $3,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        )
        RETURNING id;
        `,
          [dbUser.id, `${accessResult.rows[0].name}: ${title}`, amount],
        );

        await db.query(
          `
        UPDATE split_room_items
        SET expense_id = $1
        WHERE id = $2;
        `,
          [expenseResult.rows[0].id, itemResult.rows[0].id],
        );
      }

      await db.query(
        `
      UPDATE split_rooms
      SET
        payment_status = CASE
          WHEN $2::boolean THEN payment_status
          ELSE 'no_one_paid'
        END,
        updated_at = NOW()
      WHERE id = $1;
      `,
        [roomId, isAssignedToCurrentUser],
      );

      const notifiedUserIds = await getRoomUserIds(roomId);
      sendLiveUpdate([dbUser.id, ...notifiedUserIds], {
        type: "split-room",
        reason: "item-added",
        roomId,
      });

      return res.status(201).json({
        message: "Split item added",
        item: itemResult.rows[0],
      });
    } catch (error) {
      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Add split item failed:", error);

      return res.status(500).json({
        message: "Failed to add split item",
      });
    }
  },
);

router.post(
  "/:roomId/members/:memberId/collect",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      await ensureSplitRoomTablesOnce();
      await ensureNetSettlementTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const roomId = getRouteParam(req, "roomId");
      const memberId = getRouteParam(req, "memberId");

      if (!roomId || !memberId) {
        return res
          .status(400)
          .json({ message: "Room id and member id are required" });
      }

      await client.query("BEGIN");

      const roomResult = await client.query<{
        id: string;
        name: string;
        owner_user_id: string;
      }>(
        `
        SELECT id, name, owner_user_id
        FROM split_rooms
        WHERE id = $1
        AND owner_user_id = $2
        FOR UPDATE;
        `,
        [roomId, dbUser.id],
      );

      const room = roomResult.rows[0];

      if (!room) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "Room not found or you do not own this room",
        });
      }

      const memberResult = await client.query<RoomMemberRow>(
        `
        SELECT id, room_id, user_id, display_name, email, role, status
        FROM split_room_members
        WHERE id = $1
        AND room_id = $2;
        `,
        [memberId, roomId],
      );

      const member = memberResult.rows[0];

      if (!member) {
        await client.query("ROLLBACK");

        return res
          .status(404)
          .json({ message: "Member not found in this room" });
      }

      if (
        member.user_id === dbUser.id ||
        member.email?.toLowerCase() === dbUser.email.toLowerCase()
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "Your own spend is already counted on the dashboard",
        });
      }

      if (!member.user_id) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            "This member has not created a SplitVerse account yet, so their dashboard expense cannot be updated.",
        });
      }

      const offsetResult = await applyAutomaticNetOffsetsForUser(client, dbUser.id);

      const itemResult = await client.query<{
        id: string;
        title: string;
        amount: number;
        pending_amount: number;
        expense_id: string | null;
      }>(
        `
        WITH settled AS (
          SELECT item_id, COALESCE(SUM(amount), 0) AS settled_amount
          FROM split_room_item_settlements
          GROUP BY item_id
        )
        SELECT
          item.id,
          item.title,
          item.amount::float,
          GREATEST(item.amount - COALESCE(settled.settled_amount, 0), 0)::float AS pending_amount,
          item.expense_id
        FROM split_room_items item
        LEFT JOIN settled
          ON settled.item_id = item.id
        WHERE item.room_id = $1
        AND item.assigned_member_id = $2
        AND item.collected_at IS NULL
        AND GREATEST(item.amount - COALESCE(settled.settled_amount, 0), 0) > 0
        ORDER BY item.created_at ASC
        FOR UPDATE OF item;
        `,
        [roomId, memberId],
      );

      const touchedItemIds = itemResult.rows.map((item) => item.id);

      for (const item of itemResult.rows) {
        const pendingAmount = roundMoneyValue(Number(item.pending_amount));

        if (pendingAmount <= 0.009) {
          continue;
        }

        let expenseId = item.expense_id;

        if (!expenseId) {
          const expenseResult = await client.query<{ id: string }>(
            `
            INSERT INTO expenses (
              user_id,
              title,
              category,
              amount,
              expense_date
            )
            VALUES (
              $1,
              $2,
              'Shared room',
              $3,
              (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
            )
            RETURNING id;
            `,
            [member.user_id, `${room.name}: ${item.title}`, pendingAmount],
          );

          expenseId = expenseResult.rows[0].id;
        }

        await insertItemSettlement(client, {
          itemId: item.id,
          amount: pendingAmount,
          method: "manual",
          createdByUserId: dbUser.id,
        });

        await client.query(
          `
          UPDATE split_room_items
          SET expense_id = COALESCE(expense_id, $1)
          WHERE id = $2;
          `,
          [expenseId, item.id],
        );
      }

      const collectedItems = await markFullySettledItemsCollected(client, touchedItemIds);
      await refreshRoomPaymentStatuses(client, [
        roomId,
        ...collectedItems.map((item) => item.room_id),
      ]);

      await client.query("COMMIT");

      sendLiveUpdate(
        [dbUser.id, member.user_id, ...offsetResult.affectedUserIds],
        {
          type: "split-room",
          reason: "dues-collected",
          roomId,
        },
      );

      return res.json({
        message: "Dues marked as collected",
        updatedCount: itemResult.rows.length,
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Collect split room dues failed:", error);

      return res.status(500).json({
        message: "Failed to mark dues collected",
      });
    } finally {
      client.release();
    }
  },
);


router.patch(
  "/items/:itemId",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      await ensureSplitRoomTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const itemId = getRouteParam(req, "itemId");
      const { title, amount } = parseRequestBody(
        updateSplitRoomItemSchema,
        req.body,
      );

      if (!itemId) {
        return res.status(400).json({ message: "Item id is required" });
      }

      await client.query("BEGIN");

      const itemResult = await client.query<{
        id: string;
        room_id: string;
        title: string;
        amount: number;
        collected_at: string | null;
        expense_id: string | null;
        owner_user_id: string;
      }>(
        `
        SELECT
          item.id,
          item.room_id,
          item.title,
          item.amount::float,
          item.collected_at,
          item.expense_id,
          room.owner_user_id
        FROM split_room_items item
        INNER JOIN split_rooms room
          ON room.id = item.room_id
        WHERE item.id = $1
        FOR UPDATE;
        `,
        [itemId],
      );

      const item = itemResult.rows[0];

      if (!item) {
        await client.query("ROLLBACK");

        return res.status(404).json({ message: "Split room item not found" });
      }

      if (item.owner_user_id !== dbUser.id) {
        await client.query("ROLLBACK");

        return res.status(403).json({
          message: "Only the room owner can edit this item",
        });
      }

      if (item.collected_at || item.expense_id) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message: "Collected items cannot be edited",
        });
      }

      const updatedResult = await client.query<RoomItemRow>(
        `
        UPDATE split_room_items
        SET
          title = $1,
          amount = $2
        WHERE id = $3
        RETURNING
          id,
          room_id,
          assigned_member_id,
          title,
          amount::float,
          collected_at,
          expense_id,
          created_at;
        `,
        [title, amount, itemId],
      );

      await client.query(
        `
        UPDATE split_rooms
        SET
          payment_status = 'no_one_paid',
          updated_at = NOW()
        WHERE id = $1;
        `,
        [item.room_id],
      );

      await client.query("COMMIT");

      const notifiedUserIds = await getRoomUserIds(item.room_id);
      sendLiveUpdate([dbUser.id, ...notifiedUserIds], {
        type: "split-room",
        reason: "item-edited",
        roomId: item.room_id,
      });

      return res.json({
        message: "Split item updated",
        item: updatedResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Update split item failed:", error);

      return res.status(500).json({
        message: "Failed to update split item",
      });
    } finally {
      client.release();
    }
  },
);

router.delete(
  "/items/:itemId",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      await ensureSplitRoomTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const itemId = getRouteParam(req, "itemId");

      if (!itemId) {
        return res.status(400).json({ message: "Item id is required" });
      }

      await client.query("BEGIN");

      const itemResult = await client.query<{
        id: string;
        room_id: string;
        collected_at: string | null;
        expense_id: string | null;
        owner_user_id: string;
      }>(
        `
        SELECT
          item.id,
          item.room_id,
          item.collected_at,
          item.expense_id,
          room.owner_user_id
        FROM split_room_items item
        INNER JOIN split_rooms room
          ON room.id = item.room_id
        WHERE item.id = $1
        FOR UPDATE;
        `,
        [itemId],
      );

      const item = itemResult.rows[0];

      if (!item) {
        await client.query("ROLLBACK");

        return res.status(404).json({ message: "Split room item not found" });
      }

      if (item.owner_user_id !== dbUser.id) {
        await client.query("ROLLBACK");

        return res.status(403).json({
          message: "Only the room owner can delete this item",
        });
      }

      if (item.collected_at || item.expense_id) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message: "Collected items cannot be deleted",
        });
      }

      await client.query(
        `
        DELETE FROM split_room_items
        WHERE id = $1;
        `,
        [itemId],
      );

      await client.query(
        `
        UPDATE split_rooms
        SET
          payment_status = CASE
            WHEN NOT EXISTS (
              SELECT 1
              FROM split_room_items
              WHERE room_id = $1
            )
              THEN 'no_one_paid'
            WHEN NOT EXISTS (
              SELECT 1
              FROM split_room_items item
              INNER JOIN split_room_members member
                ON member.id = item.assigned_member_id
              WHERE item.room_id = $1
              AND item.collected_at IS NULL
              AND NOT (
                member.user_id = $2
                OR LOWER(COALESCE(member.email, '')) = LOWER($3)
              )
            )
              THEN 'all_paid'
            ELSE 'no_one_paid'
          END,
          updated_at = NOW()
        WHERE id = $1;
        `,
        [item.room_id, dbUser.id, dbUser.email],
      );

      await client.query("COMMIT");

      const notifiedUserIds = await getRoomUserIds(item.room_id);
      sendLiveUpdate([dbUser.id, ...notifiedUserIds], {
        type: "split-room",
        reason: "item-deleted",
        roomId: item.room_id,
      });

      return res.json({
        message: "Split item deleted",
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Delete split item failed:", error);

      return res.status(500).json({
        message: "Failed to delete split item",
      });
    } finally {
      client.release();
    }
  },
);



router.delete(
  "/:roomId/members/:memberId",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      await ensureSplitRoomTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const roomId = getRouteParam(req, "roomId");
      const memberId = getRouteParam(req, "memberId");

      if (!roomId || !memberId) {
        return res
          .status(400)
          .json({ message: "Room id and member id are required" });
      }

      await client.query("BEGIN");

      const roomResult = await client.query<{
        id: string;
        owner_user_id: string;
      }>(
        `
        SELECT id, owner_user_id
        FROM split_rooms
        WHERE id = $1
        AND owner_user_id = $2
        FOR UPDATE;
        `,
        [roomId, dbUser.id],
      );

      const room = roomResult.rows[0];

      if (!room) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "Room not found or you do not own this room",
        });
      }

      const memberResult = await client.query<RoomMemberRow>(
        `
        SELECT id, room_id, user_id, display_name, email, role, status
        FROM split_room_members
        WHERE id = $1
        AND room_id = $2
        FOR UPDATE;
        `,
        [memberId, roomId],
      );

      const member = memberResult.rows[0];

      if (!member) {
        await client.query("ROLLBACK");

        return res
          .status(404)
          .json({ message: "Member not found in this room" });
      }

      if (
        member.role === "owner" ||
        member.user_id === dbUser.id ||
        member.email?.toLowerCase() === dbUser.email.toLowerCase()
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "The room host cannot be removed",
        });
      }

      const assignedItemsResult = await client.query<{
        item_count: number;
      }>(
        `
        SELECT COUNT(*)::int AS item_count
        FROM split_room_items
        WHERE room_id = $1
        AND assigned_member_id = $2;
        `,
        [roomId, memberId],
      );
      const assignedItemCount = Number(
        assignedItemsResult.rows[0]?.item_count ?? 0,
      );

      if (assignedItemCount > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "This member has room history, so removing them would affect previous split records.",
        });
      }

      const notifiedUserIdsResult = await client.query<{
        user_id: string | null;
      }>(
        `
        SELECT DISTINCT user_id
        FROM split_room_members
        WHERE room_id = $1
        AND user_id IS NOT NULL;
        `,
        [roomId],
      );
      const notifiedUserIds = notifiedUserIdsResult.rows.map(
        (row) => row.user_id,
      );

      await client.query(
        `
        DELETE FROM split_room_members
        WHERE id = $1
        AND room_id = $2;
        `,
        [memberId, roomId],
      );

      await client.query(
        `
        UPDATE split_rooms
        SET updated_at = NOW()
        WHERE id = $1;
        `,
        [roomId],
      );

      await client.query("COMMIT");

      sendLiveUpdate([dbUser.id, ...notifiedUserIds], {
        type: "split-room",
        reason: "member-removed",
        roomId,
      });

      return res.json({
        message: "Member removed from room",
        removedMemberId: memberId,
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Remove split room member failed:", error);

      return res.status(500).json({
        message: "Failed to remove member from room",
      });
    } finally {
      client.release();
    }
  },
);

router.patch(
  "/:roomId/payment-status",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      await ensureSplitRoomTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const roomId = getRouteParam(req, "roomId");
      const { paymentStatus } = parseRequestBody(paymentStatusSchema, req.body);

      if (!roomId) {
        return res.status(400).json({ message: "Room id is required" });
      }

      await client.query("BEGIN");

      const roomResult = await client.query(
        `
      SELECT id
      FROM split_rooms
      WHERE id = $1
      AND owner_user_id = $2;
      `,
        [roomId, dbUser.id],
      );

      if (roomResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Room not found or you do not own this room",
        });
      }

      if (paymentStatus === "no_one_paid") {
        await client.query(
          `
        UPDATE split_room_items item
        SET collected_at = NULL
        FROM split_room_members member
        WHERE member.id = item.assigned_member_id
        AND item.room_id = $1
        AND NOT (
          member.user_id = $2
          OR LOWER(COALESCE(member.email, '')) = LOWER($3)
        );
        `,
          [roomId, dbUser.id, dbUser.email],
        );
      }

      if (paymentStatus === "all_paid" || paymentStatus === "complete") {
        await client.query(
          `
        UPDATE split_room_items item
        SET collected_at = COALESCE(item.collected_at, NOW())
        FROM split_room_members member
        WHERE member.id = item.assigned_member_id
        AND item.room_id = $1
        AND NOT (
          member.user_id = $2
          OR LOWER(COALESCE(member.email, '')) = LOWER($3)
        );
        `,
          [roomId, dbUser.id, dbUser.email],
        );
      }

      await client.query(
        `
      UPDATE split_rooms
      SET payment_status = $1,
          updated_at = NOW()
      WHERE id = $2
      AND owner_user_id = $3;
      `,
        [paymentStatus, roomId, dbUser.id],
      );

      await client.query("COMMIT");

      const notifiedUserIds = await getRoomUserIds(roomId);
      sendLiveUpdate([dbUser.id, ...notifiedUserIds], {
        type: "split-room",
        reason: "payment-status",
        roomId,
      });

      return res.json({
        message: "Room payment status updated",
        paymentStatus,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (sendValidationError(res, error)) {
        return;
      }

      console.error("Update split room payment status failed:", error);

      return res.status(500).json({
        message: "Failed to update room payment status",
      });
    } finally {
      client.release();
    }
  },
);

router.delete(
  "/:roomId",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      await ensureSplitRoomTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const roomId = getRouteParam(req, "roomId");

      if (!roomId) {
        return res.status(400).json({ message: "Room id is required" });
      }

      const roomResult = await client.query(
        `
      SELECT id, name
      FROM split_rooms
      WHERE id = $1
      AND owner_user_id = $2;
      `,
        [roomId, dbUser.id],
      );

      if (roomResult.rows.length === 0) {
        return res.status(404).json({
          message: "Room not found or you do not own this room",
        });
      }

      const dueResult = await client.query(
        `
      SELECT COALESCE(SUM(amount), 0)::float AS total_due
      FROM split_room_items
      INNER JOIN split_room_members
        ON split_room_members.id = split_room_items.assigned_member_id
      WHERE split_room_items.room_id = $1
      AND split_room_items.collected_at IS NULL
      AND NOT (
        split_room_members.user_id = $2
        OR LOWER(COALESCE(split_room_members.email, '')) = LOWER($3)
      );
      `,
        [roomId, dbUser.id, dbUser.email],
      );
      const totalDue = Number(dueResult.rows[0]?.total_due ?? 0);

      if (totalDue > 0) {
        return res.status(409).json({
          message: "All member payments must be done before deleting this room",
        });
      }

      const notifiedUserIds = await getRoomUserIds(roomId);

      await client.query("BEGIN");

      await client.query(
        `
      DELETE FROM split_rooms
      WHERE id = $1
      AND owner_user_id = $2;
      `,
        [roomId, dbUser.id],
      );

      await client.query("COMMIT");

      sendLiveUpdate([dbUser.id, ...notifiedUserIds], {
        type: "split-room",
        reason: "room-deleted",
        roomId,
      });

      return res.json({
        message: "Split room deleted",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Delete split room failed:", error);

      return res.status(500).json({
        message: "Failed to delete split room",
      });
    } finally {
      client.release();
    }
  },
);

router.post(
  "/items/:itemId/pay",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    const client = await db.connect();

    try {
      await ensureSplitRoomTablesOnce();
      await ensureNetSettlementTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      await client.query("BEGIN");

      const userResult = await client.query(
        `
        SELECT id, email
        FROM users
        WHERE firebase_uid = $1;
        `,
        [firebaseUser.uid],
      );

      if (userResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "User not found",
        });
      }

      const payerUserId = userResult.rows[0].id;
      const payerEmail = userResult.rows[0].email;
      const { walletPin } = parseRequestBody(walletPaymentSchema, req.body);

      await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text));", [
        payerUserId,
      ]);
      try {
        await verifyWalletPinForUser(client, payerUserId, walletPin);
      } catch (pinError) {
        await client.query("COMMIT");

        if (sendWalletPinError(res, pinError)) {
          return;
        }

        throw pinError;
      }

      await applyAutomaticNetOffsetsForUser(client, payerUserId);

      const itemId = getRouteParam(req, "itemId");

      if (!itemId) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "Due item id is required",
        });
      }

      const itemResult = await client.query(
        `
        SELECT
          split_room_items.id,
          split_room_items.room_id,
          split_room_items.title,
          split_room_items.amount::float,
          COALESCE(settled.settled_amount, 0)::float AS settled_amount,
          GREATEST(split_room_items.amount - COALESCE(settled.settled_amount, 0), 0)::float AS pending_amount,
          split_room_items.assigned_member_id,
          split_room_items.collected_at,
          split_room_members.user_id AS assigned_user_id,
          split_room_members.email AS assigned_email,
          split_rooms.owner_user_id AS receiver_user_id,
          owner_user.email AS receiver_email,
          split_rooms.name AS room_name
        FROM split_room_items
        JOIN split_room_members
          ON split_room_members.id = split_room_items.assigned_member_id
        JOIN split_rooms
          ON split_rooms.id = split_room_items.room_id
        JOIN users AS owner_user
          ON owner_user.id = split_rooms.owner_user_id
        LEFT JOIN (
          SELECT item_id, COALESCE(SUM(amount), 0) AS settled_amount
          FROM split_room_item_settlements
          GROUP BY item_id
        ) settled
          ON settled.item_id = split_room_items.id
        WHERE split_room_items.id = $1
        FOR UPDATE OF split_room_items;
        `,
        [itemId],
      );

      if (itemResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "Due item not found",
        });
      }

      const item = itemResult.rows[0];

      if (item.collected_at || Number(item.pending_amount) <= 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "This due is already paid",
        });
      }

      if (
        item.assigned_user_id !== payerUserId &&
        item.assigned_email?.toLowerCase() !== payerEmail.toLowerCase()
      ) {
        await client.query("ROLLBACK");

        return res.status(403).json({
          message: "You can only pay dues assigned to you",
        });
      }

      if (item.receiver_user_id === payerUserId) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "You cannot pay yourself",
        });
      }

      const balanceResult = await client.query(
        `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN type = 'credit' THEN amount
                WHEN type = 'debit' THEN -amount
                ELSE 0
              END
            )::float,
            0
          ) AS wallet_balance
        FROM wallet_transactions
        WHERE user_id = $1;
        `,
        [payerUserId],
      );

      const walletBalance = Number(balanceResult.rows[0].wallet_balance);
      const amount = roundMoneyValue(Number(item.pending_amount));

      if (walletBalance < amount) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "Insufficient wallet balance",
        });
      }

      const walletTransactionResult = await client.query<{
        id: string;
        user_id: string;
        type: string;
      }>(
        `
        INSERT INTO wallet_transactions (
          user_id,
          type,
          amount,
          description
        )
        VALUES
          ($1, 'debit', $3, $4),
          ($2, 'credit', $3, $5)
        RETURNING id, user_id, type;
        `,
        [
          payerUserId,
          item.receiver_user_id,
          amount,
          `Paid ${item.title} in ${item.room_name}`,
          `Received ${item.title} from split room ${item.room_name}`,
        ],
      );
      const debitWalletTransaction = walletTransactionResult.rows.find(
        (row) => row.user_id === payerUserId && row.type === "debit",
      );

      const expenseResult = await client.query(
        `
        INSERT INTO expenses (
          user_id,
          title,
          category,
          amount,
          expense_date
        )
        VALUES (
          $1,
          $2,
          'Shared room',
          $3,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        )
        RETURNING id;
        `,
        [payerUserId, `${item.room_name}: ${item.title}`, amount],
      );

      await insertItemSettlement(client, {
        itemId,
        amount,
        method: "wallet",
        createdByUserId: payerUserId,
        walletTransactionId: debitWalletTransaction?.id ?? null,
      });

      await client.query(
        `
        UPDATE split_room_items
        SET
          collected_at = NOW(),
          expense_id = $2
        WHERE id = $1;
        `,
        [itemId, expenseResult.rows[0].id],
      );

      await client.query(
        `
        UPDATE split_rooms
        SET
          payment_status = CASE
            WHEN payment_status = 'complete' THEN payment_status
            WHEN NOT EXISTS (
              SELECT 1
              FROM split_room_items item
              INNER JOIN split_room_members member
                ON member.id = item.assigned_member_id
              WHERE item.room_id = $1
              AND item.collected_at IS NULL
              AND NOT (
                member.user_id = $2
                OR LOWER(COALESCE(member.email, '')) = LOWER($3)
              )
            )
              THEN 'all_paid'
            ELSE payment_status
          END,
          updated_at = NOW()
        WHERE id = $1;
        `,
        [item.room_id, item.receiver_user_id, item.receiver_email],
      );

      await client.query("COMMIT");

      sendLiveUpdate([payerUserId, item.receiver_user_id], {
        type: "money",
        reason: "due-paid",
        roomId: item.room_id,
      });

      return res.json({
        message: "Due paid successfully",
        paidItem: {
          id: item.id,
          roomId: item.room_id,
          title: item.title,
          amount,
          expenseId: expenseResult.rows[0].id,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);

      if (sendValidationError(res, error) || sendWalletPinError(res, error)) {
        return;
      }

      console.error("Pay due from wallet failed:", error);

      return res.status(500).json({
        message: "Failed to pay due from wallet",
      });
    } finally {
      client.release();
    }
  },
);

router.get(
  "/pending-dues",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      await ensureSplitRoomTablesOnce();
      await ensureNetSettlementTablesOnce();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const userResult = await db.query(
        `
        SELECT id, email
        FROM users
        WHERE firebase_uid = $1;
        `,
        [firebaseUser.uid],
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      const dbUserId = userResult.rows[0].id;
      const dbUserEmail = userResult.rows[0].email;

      const offsetResult = await applyAutomaticNetOffsetsForUserInTransaction(dbUserId);

      if (offsetResult.affectedUserIds.length > 0) {
        sendLiveUpdate(offsetResult.affectedUserIds, {
          type: "split-room",
          reason: "net-settlement-adjusted",
        });
      }

      const duesResult = await db.query(
        `
        SELECT
          split_room_items.id,
          split_room_items.title,
          GREATEST(split_room_items.amount - COALESCE(settled.settled_amount, 0), 0)::float AS amount,
          split_room_items.created_at,
          split_rooms.id AS room_id,
          split_rooms.name AS room_name,
          owner_user.name AS receiver_name,
          owner_user.email AS receiver_email
        FROM split_room_items
        JOIN split_room_members
          ON split_room_members.id = split_room_items.assigned_member_id
        JOIN split_rooms
          ON split_rooms.id = split_room_items.room_id
        JOIN users AS owner_user
          ON owner_user.id = split_rooms.owner_user_id
        LEFT JOIN (
          SELECT item_id, COALESCE(SUM(amount), 0) AS settled_amount
          FROM split_room_item_settlements
          GROUP BY item_id
        ) settled
          ON settled.item_id = split_room_items.id
        WHERE (
          split_room_members.user_id = $1
          OR LOWER(COALESCE(split_room_members.email, '')) = LOWER($2)
        )
        AND split_rooms.owner_user_id <> $1
        AND split_room_items.collected_at IS NULL
        AND GREATEST(split_room_items.amount - COALESCE(settled.settled_amount, 0), 0) > 0
        ORDER BY split_room_items.created_at DESC;
        `,
        [dbUserId, dbUserEmail],
      );

      return res.json({
        dues: duesResult.rows.map((row) => ({
          id: row.id,
          title: row.title,
          amount: Number(row.amount),
          roomId: row.room_id,
          roomName: row.room_name,
          receiverName: row.receiver_name,
          receiverEmail: row.receiver_email,
          createdAt: row.created_at,
        })),
      });
    } catch (error) {
      console.error("Get pending dues failed:", error);

      return res.status(500).json({
        message: "Failed to load pending dues",
      });
    }
  },
);

export default router;
