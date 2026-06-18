import type { NextFunction, Request, Response } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth } from "../config/firebaseAdmin.js";

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export async function verifyFirebaseToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Missing authorization token",
      });
    }

    const token = authHeader.split("Bearer ")[1];

    const decodedToken = await adminAuth.verifyIdToken(token);

    req.user = decodedToken;

    next();
  } catch (error) {
    console.error("Firebase token verification failed:", error);

    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}