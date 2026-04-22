import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

export type R2Env = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function getR2ConfigFromEnv(): R2Env | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function createR2S3Client(config: R2Env): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function putObjectFromNodeStream(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Readable,
  contentType: string,
  contentLength: number
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: contentLength,
    })
  );
}
