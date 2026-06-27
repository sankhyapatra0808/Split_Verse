import { db } from "../config/db.js";
let performanceIndexesReady = null;
const performanceIndexes = [
    {
        tableName: "users",
        sql: `CREATE INDEX IF NOT EXISTS users_lower_email_idx ON users (LOWER(email));`,
    },
    {
        tableName: "expenses",
        sql: `CREATE INDEX IF NOT EXISTS expenses_user_expense_date_idx ON expenses (user_id, expense_date DESC);`,
    },
    {
        tableName: "expenses",
        sql: `CREATE INDEX IF NOT EXISTS expenses_user_created_at_idx ON expenses (user_id, created_at DESC);`,
    },
    {
        tableName: "expenses",
        sql: `CREATE INDEX IF NOT EXISTS expenses_shared_room_lookup_idx ON expenses (user_id, category, title, amount) WHERE category = 'Shared room';`,
    },
    {
        tableName: "wallet_transactions",
        sql: `CREATE INDEX IF NOT EXISTS wallet_transactions_user_created_idx ON wallet_transactions (user_id, created_at DESC);`,
    },
    {
        tableName: "wallet_transactions",
        sql: `CREATE INDEX IF NOT EXISTS wallet_transactions_user_type_created_idx ON wallet_transactions (user_id, type, created_at DESC);`,
    },
    {
        tableName: "wallet_transactions",
        sql: `CREATE INDEX IF NOT EXISTS wallet_transactions_user_type_amount_created_idx ON wallet_transactions (user_id, type, amount, created_at DESC);`,
    },
    {
        tableName: "settlements",
        sql: `CREATE INDEX IF NOT EXISTS settlements_from_status_created_idx ON settlements (from_user_id, status, created_at DESC);`,
    },
    {
        tableName: "settlements",
        sql: `CREATE INDEX IF NOT EXISTS settlements_to_status_created_idx ON settlements (to_user_id, status, created_at DESC);`,
    },
    {
        tableName: "split_rooms",
        sql: `CREATE INDEX IF NOT EXISTS split_rooms_owner_created_idx ON split_rooms (owner_user_id, created_at DESC);`,
    },
    {
        tableName: "split_room_members",
        sql: `CREATE INDEX IF NOT EXISTS split_room_members_room_created_idx ON split_room_members (room_id, created_at ASC);`,
    },
    {
        tableName: "split_room_members",
        sql: `CREATE INDEX IF NOT EXISTS split_room_members_user_room_idx ON split_room_members (user_id, room_id) WHERE user_id IS NOT NULL;`,
    },
    {
        tableName: "split_room_members",
        sql: `CREATE INDEX IF NOT EXISTS split_room_members_lower_email_room_idx ON split_room_members (LOWER(email), room_id) WHERE email IS NOT NULL;`,
    },
    {
        tableName: "split_room_items",
        sql: `CREATE INDEX IF NOT EXISTS split_room_items_room_created_idx ON split_room_items (room_id, created_at DESC);`,
    },
    {
        tableName: "split_room_items",
        sql: `CREATE INDEX IF NOT EXISTS split_room_items_room_assigned_collected_idx ON split_room_items (room_id, assigned_member_id, collected_at);`,
    },
    {
        tableName: "split_room_items",
        sql: `CREATE INDEX IF NOT EXISTS split_room_items_assigned_collected_idx ON split_room_items (assigned_member_id, collected_at);`,
    },
    {
        tableName: "split_room_items",
        sql: `CREATE INDEX IF NOT EXISTS split_room_items_expense_id_idx ON split_room_items (expense_id) WHERE expense_id IS NOT NULL;`,
    },
    {
        tableName: "friend_requests",
        sql: `CREATE INDEX IF NOT EXISTS friend_requests_recipient_status_created_idx ON friend_requests (LOWER(recipient_email), status, created_at DESC);`,
    },
    {
        tableName: "friend_requests",
        sql: `CREATE INDEX IF NOT EXISTS friend_requests_requester_created_idx ON friend_requests (requester_user_id, created_at DESC);`,
    },
    {
        tableName: "friendships",
        sql: `CREATE INDEX IF NOT EXISTS friendships_user_one_idx ON friendships (user_one_id);`,
    },
    {
        tableName: "friendships",
        sql: `CREATE INDEX IF NOT EXISTS friendships_user_two_idx ON friendships (user_two_id);`,
    },
];
async function tableExists(tableName) {
    const result = await db.query("SELECT to_regclass($1) AS exists;", [`public.${tableName}`]);
    return Boolean(result.rows[0]?.exists);
}
async function createPerformanceIndexes() {
    const tableAvailability = new Map();
    for (const indexDefinition of performanceIndexes) {
        if (!tableAvailability.has(indexDefinition.tableName)) {
            tableAvailability.set(indexDefinition.tableName, await tableExists(indexDefinition.tableName));
        }
        if (!tableAvailability.get(indexDefinition.tableName)) {
            continue;
        }
        await db.query(indexDefinition.sql);
    }
}
export async function ensurePerformanceIndexes() {
    performanceIndexesReady ??= createPerformanceIndexes().catch((error) => {
        performanceIndexesReady = null;
        throw error;
    });
    return performanceIndexesReady;
}
export function ensurePerformanceIndexesInBackground() {
    if (process.env.DISABLE_PERFORMANCE_INDEXES === "true") {
        return;
    }
    void ensurePerformanceIndexes().catch((error) => {
        console.error("Performance index warmup failed:", error);
    });
}
