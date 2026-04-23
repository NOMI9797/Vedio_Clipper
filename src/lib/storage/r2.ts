import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
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

/**
 * Download an object to a local file path (e.g. for FFmpeg processing).
 */
export async function getObjectToFile(
  s3: S3Client,
  bucket: string,
  key: string,
  destPath: string
): Promise<void> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  if (!res.Body) {
    throw new Error("Empty S3 object body");
  }
  const out = createWriteStream(destPath, { highWaterMark: 1024 * 1024 });
  await pipeline(res.Body as NodeJS.ReadableStream, out);
}

export async function putObjectJson(
  s3: S3Client,
  bucket: string,
  key: string,
  data: string
): Promise<void> {
  const body = Buffer.from(data, "utf8");
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
      ContentLength: body.length,
    })
  );
}

export async function putObjectBuffer(
  s3: S3Client,
  bucket: string,
  key: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
      ContentLength: data.length,
    })
  );
}
