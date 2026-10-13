import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import sharp from "sharp";
import { env } from "../../config/env.js";

const uploadLifetimeSeconds = 10 * 60;

function storageConfig() {
  if (
    !env.PHOTO_STORAGE_ENDPOINT ||
    !env.PHOTO_STORAGE_PUBLIC_BASE_URL ||
    !env.PHOTO_STORAGE_ACCESS_KEY ||
    !env.PHOTO_STORAGE_SECRET_KEY
  ) {
    throw new Error("Profile photo storage is not configured");
  }

  return {
    endpoint: env.PHOTO_STORAGE_ENDPOINT,
    publicBaseUrl: env.PHOTO_STORAGE_PUBLIC_BASE_URL.replace(/\/$/, ""),
    credentials: {
      accessKeyId: env.PHOTO_STORAGE_ACCESS_KEY,
      secretAccessKey: env.PHOTO_STORAGE_SECRET_KEY
    }
  };
}

function client() {
  const config = storageConfig();
  return new S3Client({
    region: env.PHOTO_STORAGE_REGION,
    endpoint: config.endpoint,
    credentials: config.credentials,
    forcePathStyle: true
  });
}

function extensionFor(contentType: string) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[contentType];
}

export function createPhotoObjectKey(userId: string, contentType: string) {
  return `incoming/${userId}/${randomUUID()}.${extensionFor(contentType)}`;
}

export function processedPhotoObjectKey(userId: string, uploadId: string) {
  return `profiles/${userId}/${uploadId}.webp`;
}

export function photoPublicUrl(objectKey: string) {
  return `${storageConfig().publicBaseUrl}/${objectKey}`;
}

export async function createPhotoUploadPost(input: {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
}) {
  return createPresignedPost(client(), {
    Bucket: env.PHOTO_STORAGE_UPLOAD_BUCKET,
    Key: input.objectKey,
    Expires: uploadLifetimeSeconds,
    Fields: { "Content-Type": input.contentType },
    Conditions: [
      ["eq", "$Content-Type", input.contentType],
      ["content-length-range", input.sizeBytes, input.sizeBytes]
    ]
  });
}

export async function processPhotoObject(input: {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  outputKey: string;
}) {
  const object = await client().send(
    new HeadObjectCommand({ Bucket: env.PHOTO_STORAGE_UPLOAD_BUCKET, Key: input.objectKey })
  );
  if (object.ContentLength !== input.sizeBytes || object.ContentType !== input.contentType) {
    throw new Error("Uploaded photo does not match its upload intent");
  }

  const source = await client().send(
    new GetObjectCommand({ Bucket: env.PHOTO_STORAGE_UPLOAD_BUCKET, Key: input.objectKey })
  );
  if (!source.Body) throw new Error("Uploaded photo is empty");
  const bytes = await source.Body.transformToByteArray();
  const sanitized = await sharp(bytes)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  await client().send(
    new PutObjectCommand({
      Bucket: env.PHOTO_STORAGE_BUCKET,
      Key: input.outputKey,
      Body: sanitized,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
  return { contentType: "image/webp", sizeBytes: sanitized.length };
}

export async function deletePhotoObject(objectKey: string) {
  await client().send(
    new DeleteObjectCommand({ Bucket: env.PHOTO_STORAGE_BUCKET, Key: objectKey })
  );
}

export async function deletePhotoUploadObject(objectKey: string) {
  await client().send(
    new DeleteObjectCommand({ Bucket: env.PHOTO_STORAGE_UPLOAD_BUCKET, Key: objectKey })
  );
}

export function photoUploadExpiresAt() {
  return new Date(Date.now() + uploadLifetimeSeconds * 1000);
}
