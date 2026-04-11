import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod";
import multer from "multer";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission, getObjectAclPolicy } from "../lib/objectAcl";
import { requireAuth } from "./auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const uploadProfiles = {
  receipt: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  },
  matchResult: {
    maxBytes: 6 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  gameVerification: {
    maxBytes: 4 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  avatar: {
    maxBytes: 2 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  general: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
} as const;

type UploadContext = keyof typeof uploadProfiles;

function normalizeUploadContext(raw: unknown): UploadContext {
  if (typeof raw === "string" && raw in uploadProfiles) return raw as UploadContext;
  return "general";
}

function detectMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  return null;
}

function hasSuspiciousPayload(buffer: Buffer, mimeType: string): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 256 * 1024)).toString("latin1").toLowerCase();
  if (sample.includes("<script") || sample.includes("<svg") || sample.includes("<?php") || sample.includes("<html")) return true;
  if (mimeType === "application/pdf") {
    return sample.includes("/javascript") || sample.includes("/js") || sample.includes("/openaction") || sample.includes("/launch") || sample.includes("/aa");
  }
  return false;
}

function validateUploadedFile(file: Express.Multer.File, context: UploadContext): { ok: true; mimeType: string } | { ok: false; status: number; error: string } {
  const profile = uploadProfiles[context];
  const claimedMime = (file.mimetype || "").toLowerCase();
  if (!file.buffer?.length) return { ok: false, status: 400, error: "File is empty" };
  if (file.size > profile.maxBytes) {
    return { ok: false, status: 413, error: `File is too large. Maximum size is ${Math.floor(profile.maxBytes / 1024 / 1024)}MB.` };
  }
  if (!profile.mimeTypes.includes(claimedMime as any)) {
    return { ok: false, status: 415, error: "Unsupported file type" };
  }
  const detectedMime = detectMimeType(file.buffer);
  if (!detectedMime || detectedMime !== claimedMime) {
    return { ok: false, status: 415, error: "File content does not match the selected file type" };
  }
  if (hasSuspiciousPayload(file.buffer, detectedMime)) {
    return { ok: false, status: 400, error: "File failed safety checks" };
  }
  return { ok: true, mimeType: detectedMime };
}

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number(),
  contentType: z.string(),
});

/**
 * POST /storage/uploads/request-url
 * Host-only: request a presigned URL for avatar image upload.
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["host", "admin", "player"].includes(user.role)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;
    const profile = uploadProfiles.avatar;
    if (size > profile.maxBytes || !profile.mimeTypes.includes(contentType.toLowerCase() as any)) {
      res.status(415).json({ error: "Unsupported or oversized file" });
      return;
    }
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /storage/uploads/file
 * Proxy upload: client sends the file here, server uploads to GCS.
 * Avoids CORS issues with direct GCS uploads.
 */
router.post("/storage/uploads/file", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["host", "admin", "player"].includes(user.role)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }
  try {
    const uploadContext = normalizeUploadContext(req.body?.context);
    const validation = validateUploadedFile(file, uploadContext);
    if (!validation.ok) {
      res.status(validation.status).json({ error: validation.error });
      return;
    }
    const objectPath = await objectStorageService.uploadFile(file.buffer, validation.mimeType, {
      ownerId: user.id,
      originalName: file.originalname,
      context: uploadContext,
    });
    res.json({ objectPath });
  } catch (error) {
    req.log.error({ err: error }, "Error uploading file");
    res.status(500).json({ error: "Failed to upload file" });
  }
});

/**
 * GET /storage/public-objects/*
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) { res.status(404).json({ error: "File not found" }); return; }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else { res.end(); }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 * Serve uploaded objects (avatars, etc.).
 */
router.get("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const aclPolicy = await getObjectAclPolicy(objectFile);
    if (aclPolicy) {
      const canAccess = user.role === "admin" || await objectStorageService.canAccessObjectEntity({
        userId: user.id,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        res.status(403).json({ error: "Unauthorized" });
        return;
      }
    }
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else { res.end(); }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
