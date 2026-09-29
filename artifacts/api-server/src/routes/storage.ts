import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@workspace/db';

import { ObjectPermission } from '../lib/objectAcl';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import { getRequestUser, requireRole } from "../middlewares/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const PUBLIC_IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);
const INACTIVE_IMAGE_VIEW_ROLES = new Set([
  'staff',
  'branch_manager',
  'operations_manager',
  'operations',
  'manager',
  'admin',
]);

function canonicalObjectPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let path = value.trim();
  if (path.startsWith('/api/storage/objects/')) {
    path = path.slice('/api/storage'.length);
  }
  if (!path.startsWith('/objects/')) return undefined;

  const segments = path.slice('/objects/'.length).split('/');
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\\'),
    )
  ) {
    return undefined;
  }
  return `/objects/${segments.join('/')}`;
}

async function isPublicImageReference(path: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT (
      EXISTS (
        SELECT 1 FROM products p
        WHERE p.status = 'active'
          AND (
            p.image_url = ${path}
            OR p.gallery @> ${JSON.stringify([path])}::jsonb
          )
      )
      OR EXISTS (
        SELECT 1 FROM branches b
        WHERE b.status = 'active' AND b.active = true
          AND (
            b.image_url = ${path}
            OR b.og_image_url = ${path}
            OR b.gallery @> ${JSON.stringify([path])}::jsonb
          )
      )
      OR EXISTS (
        SELECT 1
        FROM branch_images bi
        INNER JOIN branches b ON b.id = bi.branch_id
        WHERE bi.url = ${path}
          AND bi.active = true
          AND b.status = 'active'
          AND b.active = true
      )
      OR EXISTS (
        SELECT 1 FROM categories c
        WHERE c.active = true AND c.image_url = ${path}
      )
    ) AS referenced
  `);
  return result.rows[0]?.referenced === true;
}

async function isInactiveImageReference(path: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT (
      EXISTS (
        SELECT 1 FROM products p
        WHERE p.status <> 'active'
          AND (
            p.image_url = ${path}
            OR p.gallery @> ${JSON.stringify([path])}::jsonb
          )
      )
      OR EXISTS (
        SELECT 1 FROM branches b
        WHERE (b.status <> 'active' OR b.active = false)
          AND (
            b.image_url = ${path}
            OR b.og_image_url = ${path}
            OR b.gallery @> ${JSON.stringify([path])}::jsonb
          )
      )
      OR EXISTS (
        SELECT 1
        FROM branch_images bi
        INNER JOIN branches b ON b.id = bi.branch_id
        WHERE bi.url = ${path}
          AND (
            bi.active = false
            OR b.status <> 'active'
            OR b.active = false
          )
      )
      OR EXISTS (
        SELECT 1 FROM categories c
        WHERE c.active = false AND c.image_url = ${path}
      )
    ) AS referenced
  `);
  return result.rows[0]?.referenced === true;
}

async function catalogImageContentType(
  objectFile: Awaited<ReturnType<ObjectStorageService['getObjectEntityFile']>>,
): Promise<{ contentType: string; etag?: string } | undefined> {
  const [metadata] = await objectFile.getMetadata();
  let contentType = String(metadata.contentType || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (!contentType) {
    contentType = (await sniffLegacyImageContentType(objectFile)) || '';
  }
  if (!PUBLIC_IMAGE_CONTENT_TYPES.has(contentType)) return undefined;
  const etag =
    typeof metadata.etag === 'string'
      ? metadata.etag.startsWith('"')
        ? metadata.etag
        : `"${metadata.etag}"`
      : undefined;
  return { contentType, etag };
}

async function sniffLegacyImageContentType(
  objectFile: Awaited<ReturnType<ObjectStorageService['getObjectEntityFile']>>,
): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of objectFile.createReadStream({ start: 0, end: 31 })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(bytes);
    length += bytes.length;
    if (length >= 32) break;
  }
  const signature = Buffer.concat(chunks, length);
  if (
    signature.length >= 3 &&
    signature[0] === 0xff &&
    signature[1] === 0xd8 &&
    signature[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (
    signature.subarray(0, 6).toString('ascii') === 'GIF87a' ||
    signature.subarray(0, 6).toString('ascii') === 'GIF89a'
  ) {
    return 'image/gif';
  }
  if (
    signature.subarray(0, 4).toString('ascii') === 'RIFF' &&
    signature.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    signature.subarray(4, 8).toString('ascii') === 'ftyp' &&
    ['avif', 'avis'].includes(signature.subarray(8, 12).toString('ascii'))
  ) {
    return 'image/avif';
  }
  return undefined;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  requireRole("staff", "branch_manager", "operations_manager", "operations", "manager", "admin"),
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve public product/branch images only when referenced by active catalog
 * records. Inactive catalog images are staff-only; other objects require ACL.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = canonicalObjectPath(`/objects/${wildcardPath}`);
    if (!objectPath) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    const isPublicImage = await isPublicImageReference(objectPath);
    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    let publicImageContentType: string | undefined;
    let publicImageEtag: string | undefined;
    if (isPublicImage) {
      const imageMetadata = await catalogImageContentType(objectFile);
      if (!imageMetadata) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      publicImageContentType = imageMetadata.contentType;
      publicImageEtag = imageMetadata.etag;
    }

    if (!isPublicImage) {
      const user = await getRequestUser(req);
      const canViewInactiveCatalogImage =
        Boolean(user && INACTIVE_IMAGE_VIEW_ROLES.has(user.role)) &&
        (await isInactiveImageReference(objectPath));
      if (canViewInactiveCatalogImage) {
        const imageMetadata = await catalogImageContentType(objectFile);
        if (!imageMetadata) {
          res.status(404).json({ error: 'Object not found' });
          return;
        }
        publicImageContentType = imageMetadata.contentType;
      }
      const canRead = await objectStorageService.canAccessObjectEntity({
        userId: user?.id,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canViewInactiveCatalogImage && !canRead) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
    }

    if (publicImageContentType) {
      res.setHeader('Content-Type', publicImageContentType);
    }
    if (publicImageEtag) res.setHeader('ETag', publicImageEtag);
    res.setHeader(
      'Cache-Control',
      isPublicImage
        ? 'public, max-age=0, must-revalidate'
        : 'private, no-store',
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const ifNoneMatch = req.get('if-none-match');
    if (
      isPublicImage &&
      publicImageEtag &&
      ifNoneMatch
        ?.split(',')
        .some((candidate) => {
          const trimmed = candidate.trim();
          return (
            trimmed === '*' ||
            trimmed === publicImageEtag ||
            trimmed === `W/${publicImageEtag}`
          );
        })
    ) {
      res.status(304).end();
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (publicImageContentType) {
      res.setHeader('Content-Type', publicImageContentType);
    }
    if (publicImageEtag) res.setHeader('ETag', publicImageEtag);
    res.setHeader(
      'Cache-Control',
      isPublicImage
        ? 'public, max-age=0, must-revalidate'
        : 'private, no-store',
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
