import express from "express";
import { db } from "../config/db.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";

const router = express.Router();

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
  role: string;
  status: string;
};

type RoomItemRow = {
  id: string;
  room_id: string;
  assigned_member_id: string;
  title: string;
  amount: number;
  collected_at: string | null;
  expense_id: string | null;
  created_at: string;
};

type RoomPaymentStatus = "no_one_paid" | "all_paid" | "complete";

async function ensureSplitRoomTables() {
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
  const serializedMembers = members.map((member) => ({
    ...member,
    isMe:
      member.user_id === currentUser.id ||
      member.email?.toLowerCase() === currentUser.email.toLowerCase(),
    isOwner: member.role === "owner",
  }));
  const memberById = new Map(
    serializedMembers.map((member) => [member.id, member]),
  );

  items.forEach((item) => {
    const member = memberById.get(item.assigned_member_id);
    const amount = Number(item.amount);

    itemCountByMember.set(
      item.assigned_member_id,
      (itemCountByMember.get(item.assigned_member_id) ?? 0) + 1,
    );
    amountByMember.set(
      item.assigned_member_id,
      (amountByMember.get(item.assigned_member_id) ?? 0) + amount,
    );

    if (!member?.isMe) {
      if (item.collected_at) {
        collectedByMember.set(
          item.assigned_member_id,
          (collectedByMember.get(item.assigned_member_id) ?? 0) + amount,
        );
      } else {
        outstandingByMember.set(
          item.assigned_member_id,
          (outstandingByMember.get(item.assigned_member_id) ?? 0) + amount,
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
      const outstandingAmountForMember = outstandingByMember.get(member.id) ?? 0;
      const collectedAmountForMember = collectedByMember.get(member.id) ?? 0;

      return {
        memberId: member.id,
        name: member.isMe ? "Me" : member.display_name || member.email,
        detail:
          member.isMe
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
        isCollected: !member.isMe && amount > 0 && outstandingAmountForMember === 0,
        itemCount: itemCountByMember.get(member.id) ?? 0,
      };
    }),
    items: items.map((item) => ({
      ...item,
      amount: Number(item.amount),
      isCollected: Boolean(item.collected_at),
    })),
  };
}

function normalizePaymentStatus(status: unknown): RoomPaymentStatus {
  if (status === "all_paid" || status === "complete") {
    return status;
  }

  return "no_one_paid";
}

router.get("/", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    await ensureSplitRoomTables();

    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const dbUser = await getCurrentUser(firebaseUser.uid);

    if (!dbUser) {
      return res.status(404).json({ message: "User not found in database" });
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
        SELECT id, room_id, user_id, display_name, email, role, status
        FROM split_room_members
        WHERE room_id = ANY($1::uuid[])
        ORDER BY created_at ASC;
        `,
        [roomIds],
      ),
      db.query<RoomItemRow>(
        `
        SELECT
          id,
          room_id,
          assigned_member_id,
          title,
          amount::float,
          collected_at,
          expense_id,
          created_at
        FROM split_room_items
        WHERE room_id = ANY($1::uuid[])
        ORDER BY created_at DESC;
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

router.post("/", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const client = await db.connect();

  try {
    await ensureSplitRoomTables();

    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const dbUser = await getCurrentUser(firebaseUser.uid);

    if (!dbUser) {
      return res.status(404).json({ message: "User not found in database" });
    }

    const name = String(req.body.name ?? "").trim();
    const category = String(req.body.category ?? "general").trim();
    const members = parseMembers(req.body.members);

    if (!name) {
      return res.status(400).json({ message: "Room name is required" });
    }

    await client.query("BEGIN");

    const roomResult = await client.query(
      `
      INSERT INTO split_rooms (owner_user_id, name, category, payment_status)
      VALUES ($1, $2, $3, 'no_one_paid')
      RETURNING id, name, category, payment_status, created_at;
      `,
      [dbUser.id, name, category || "general"],
    );

    const room = roomResult.rows[0];

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
      VALUES ($1, $2, $3, $4, 'owner', 'active');
      `,
      [room.id, dbUser.id, dbUser.name || "Me", dbUser.email],
    );

    for (const member of members) {
      const identity = memberToIdentity(member);

      if (identity.email === dbUser.email.toLowerCase()) {
        continue;
      }

      const existingUser = identity.email
        ? await client.query<DbUserRow>(
            `
            SELECT id, name, email
            FROM users
            WHERE LOWER(email) = LOWER($1);
            `,
            [identity.email],
          )
        : null;
      const matchedUser = existingUser?.rows[0];

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
        VALUES ($1, $2, $3, $4, 'member', $5)
        ON CONFLICT DO NOTHING;
        `,
        [
          room.id,
          matchedUser?.id ?? null,
          matchedUser?.name || identity.displayName,
          matchedUser?.email || identity.email,
          matchedUser ? "active" : "invited",
        ],
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Split room created",
      room,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create split room failed:", error);

    return res.status(500).json({
      message: "Failed to create split room",
    });
  } finally {
    client.release();
  }
});

router.post("/:roomId/items", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    await ensureSplitRoomTables();

    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const dbUser = await getCurrentUser(firebaseUser.uid);

    if (!dbUser) {
      return res.status(404).json({ message: "User not found in database" });
    }

    const roomId = req.params.roomId;
    const title = String(req.body.title ?? "").trim();
    const assignedMemberId = String(req.body.assignedMemberId ?? "").trim();
    const amount = Number(req.body.amount);

    if (!title) {
      return res.status(400).json({ message: "Item name is required" });
    }

    if (!assignedMemberId) {
      return res.status(400).json({ message: "Assigned member is required" });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }

    const accessResult = await db.query(
      `
      SELECT room.id, room.name
      FROM split_rooms room
      INNER JOIN split_room_members member
        ON member.room_id = room.id
      WHERE room.id = $1
      AND (
        room.owner_user_id = $2
        OR member.user_id = $2
        OR LOWER(member.email) = LOWER($3)
      )
      LIMIT 1;
      `,
      [roomId, dbUser.id, dbUser.email],
    );

    if (accessResult.rows.length === 0) {
      return res.status(404).json({ message: "Room not found" });
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
      return res.status(400).json({ message: "Assigned member is not in this room" });
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

    return res.status(201).json({
      message: "Split item added",
      item: itemResult.rows[0],
    });
  } catch (error) {
    console.error("Add split item failed:", error);

    return res.status(500).json({
      message: "Failed to add split item",
    });
  }
});

router.post(
  "/:roomId/members/:memberId/collect",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      await ensureSplitRoomTables();

      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await getCurrentUser(firebaseUser.uid);

      if (!dbUser) {
        return res.status(404).json({ message: "User not found in database" });
      }

      const roomResult = await db.query(
        `
        SELECT id
        FROM split_rooms
        WHERE id = $1
        AND owner_user_id = $2;
        `,
        [req.params.roomId, dbUser.id],
      );

      if (roomResult.rows.length === 0) {
        return res.status(404).json({
          message: "Room not found or you do not own this room",
        });
      }

      const memberResult = await db.query<RoomMemberRow>(
        `
        SELECT id, room_id, user_id, display_name, email, role, status
        FROM split_room_members
        WHERE id = $1
        AND room_id = $2;
        `,
        [req.params.memberId, req.params.roomId],
      );
      const member = memberResult.rows[0];

      if (!member) {
        return res.status(404).json({ message: "Member not found in this room" });
      }

      if (
        member.user_id === dbUser.id ||
        member.email?.toLowerCase() === dbUser.email.toLowerCase()
      ) {
        return res.status(400).json({
          message: "Your own spend is already counted on the dashboard",
        });
      }

      const updateResult = await db.query(
        `
        UPDATE split_room_items
        SET collected_at = NOW()
        WHERE room_id = $1
        AND assigned_member_id = $2
        AND collected_at IS NULL
        RETURNING id;
        `,
        [req.params.roomId, req.params.memberId],
      );

      await db.query(
        `
        UPDATE split_rooms
        SET
          payment_status = CASE
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
        [req.params.roomId, dbUser.id, dbUser.email],
      );

      return res.json({
        message: "Dues marked as collected",
        updatedCount: updateResult.rows.length,
      });
    } catch (error) {
      console.error("Collect split room dues failed:", error);

      return res.status(500).json({
        message: "Failed to mark dues collected",
      });
    }
  },
);

router.patch("/:roomId/payment-status", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const client = await db.connect();

  try {
    await ensureSplitRoomTables();

    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const dbUser = await getCurrentUser(firebaseUser.uid);

    if (!dbUser) {
      return res.status(404).json({ message: "User not found in database" });
    }

    const paymentStatus = normalizePaymentStatus(req.body.paymentStatus);

    await client.query("BEGIN");

    const roomResult = await client.query(
      `
      SELECT id
      FROM split_rooms
      WHERE id = $1
      AND owner_user_id = $2;
      `,
      [req.params.roomId, dbUser.id],
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
        [req.params.roomId, dbUser.id, dbUser.email],
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
        [req.params.roomId, dbUser.id, dbUser.email],
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
      [paymentStatus, req.params.roomId, dbUser.id],
    );

    await client.query("COMMIT");

    return res.json({
      message: "Room payment status updated",
      paymentStatus,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update split room payment status failed:", error);

    return res.status(500).json({
      message: "Failed to update room payment status",
    });
  } finally {
    client.release();
  }
});

router.delete("/:roomId", verifyFirebaseToken, async (req: AuthRequest, res) => {
  const client = await db.connect();

  try {
    await ensureSplitRoomTables();

    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const dbUser = await getCurrentUser(firebaseUser.uid);

    if (!dbUser) {
      return res.status(404).json({ message: "User not found in database" });
    }

    const roomId = req.params.roomId;

    const roomResult = await client.query(
      `
      SELECT id, name, payment_status
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

    if (normalizePaymentStatus(roomResult.rows[0].payment_status) !== "complete") {
      return res.status(409).json({
        message: "Mark this room complete before deleting it",
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
        message: "Settle all room dues before deleting this room",
      });
    }

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
});

export default router;
