import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { env } from "../src/config/env.js";

if (
  !env.PHOTO_STORAGE_ENDPOINT ||
  !env.PHOTO_STORAGE_ACCESS_KEY ||
  !env.PHOTO_STORAGE_SECRET_KEY
) {
  throw new Error("Photo storage environment variables are required");
}

const client = new S3Client({
  region: env.PHOTO_STORAGE_REGION,
  endpoint: env.PHOTO_STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: env.PHOTO_STORAGE_ACCESS_KEY,
    secretAccessKey: env.PHOTO_STORAGE_SECRET_KEY
  },
  forcePathStyle: true
});

async function createBucket(bucket: string) {
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (!(error instanceof Error) || !["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(error.name)) {
      throw error;
    }
  }
}

await createBucket(env.PHOTO_STORAGE_UPLOAD_BUCKET);
await createBucket(env.PHOTO_STORAGE_BUCKET);
await client.send(
  new PutBucketPolicyCommand({
    Bucket: env.PHOTO_STORAGE_BUCKET,
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicProfilePhotoReads",
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${env.PHOTO_STORAGE_BUCKET}/*`
        }
      ]
    })
  })
);

console.log("Profile photo storage buckets are ready");
