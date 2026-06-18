import express from "express";
import { db } from "../config/db.js";
import {
  type AuthRequest,
  verifyFirebaseToken,
} from "../middleware/verifyFirebaseToken.js";

const router = express.Router();

router.post(
  "/sync-user",
  verifyFirebaseToken,
  async (req: AuthRequest, res) => {
    try {
      const firebaseUser = req.user;

      if (!firebaseUser) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      const firebaseUid = firebaseUser.uid;
      const email = firebaseUser.email;

      if (!email) {
        return res.status(400).json({
          message: "Firebase user email is missing",
        });
      }

      const name = firebaseUser.name || email.split("@")[0];
      const photoUrl = firebaseUser.picture || null;
      const provider = firebaseUser.firebase?.sign_in_provider || "unknown";

      const result = await db.query(
        `
      INSERT INTO users (
        firebase_uid,
        name,
        email,
        photo_url,
        provider
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (firebase_uid)
      DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        photo_url = EXCLUDED.photo_url,
        provider = EXCLUDED.provider,
        updated_at = NOW()
      RETURNING *;
      `,
        [firebaseUid, name, email, photoUrl, provider],
      );

      return res.json({
        message: "User synced successfully",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Sync user failed:", error);

      return res.status(500).json({
        message: "Failed to sync user",
      });
    }
  },
);

router.get("/me", verifyFirebaseToken, async (req: AuthRequest, res) => {
  try {
    const firebaseUser = req.user;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const result = await db.query(
      `
      SELECT
        id,
        firebase_uid,
        name,
        email,
        photo_url,
        provider,
        created_at,
        updated_at
      FROM users
      WHERE firebase_uid = $1;
      `,
      [firebaseUser.uid],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found in database",
      });
    }

    return res.json({
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Get current user failed:", error);

    return res.status(500).json({
      message: "Failed to get current user",
    });
  }
});

export default router;
