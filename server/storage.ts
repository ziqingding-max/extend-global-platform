import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

/**
 * Normalize OSS region for AWS SDK compatibility.
 * Alibaba Cloud OSS uses region IDs like "oss-ap-southeast-3",
 * but AWS SDK expects the region without the "oss-" prefix, e.g. "ap-southeast-3".
 */
function normalizeRegion(region: string): string {
  return region.replace(/^oss-/, "");
}

/**
 * Normalize OSS endpoint to S3-compatible format.
 * Alibaba Cloud OSS S3-compatible endpoint must use the format:
 *   https://s3.oss-{region}.aliyuncs.com
 * instead of:
 *   https://oss-{region}.aliyuncs.com
 *
 * See: https://help.aliyun.com/zh/oss/developer-reference/use-aws-sdks-to-access-oss
 */
function normalizeEndpoint(endpoint: string): string {
  // If endpoint already contains "s3.oss-", it's already in the correct format
  if (endpoint.includes("s3.oss-")) {
    return endpoint;
  }
  // Convert https://oss-{region}.aliyuncs.com → https://s3.oss-{region}.aliyuncs.com
  return endpoint.replace(/^(https?:\/\/)(oss-)/, "$1s3.$2");
}

const ossRegion = normalizeRegion(ENV.ossRegion || "oss-cn-hangzhou");
const ossEndpoint = normalizeEndpoint(ENV.ossEndpoint || "https://oss-cn-hangzhou.aliyuncs.com");

// Initialize S3 Client (compatible with Alibaba Cloud OSS)
const s3Client = new S3Client({
  region: ossRegion,
  endpoint: ossEndpoint,
  credentials: {
    accessKeyId: ENV.ossAccessKeyId,
    secretAccessKey: ENV.ossAccessKeySecret,
  },
  forcePathStyle: false, // OSS uses virtual-hosted style: https://bucket.s3.oss-region.aliyuncs.com
});

const BUCKET_NAME = ENV.ossBucket;

/**
 * Upload a file to Alibaba Cloud OSS (S3 Compatible)
 * Returns the object key and a public URL (if bucket is public) or just the key.
 * For private buckets, use storageGet() to retrieve a signed URL.
 */
export async function storagePut(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (!ENV.ossAccessKeyId || !ENV.ossAccessKeySecret || !BUCKET_NAME) {
    console.warn("[Storage] No OSS credentials configured. Using mock storage.");
    return { key, url: `https://mock-storage.local/${key}` };
  }

  // Ensure key doesn't start with slash
  const normalizedKey = key.replace(/^\/+/, "");

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: normalizedKey,
    Body: body,
    ContentType: contentType,
  });

  try {
    await s3Client.send(command);
    
    // Construct a direct URL using the OSS virtual-hosted style
    // Format: https://{bucket}.oss-{region}.aliyuncs.com/{key}
    // Note: For private buckets, this URL won't be accessible directly without signing.
    // Real access should go through storageGet() which signs the URL.
    const rawEndpoint = ENV.ossEndpoint || `https://oss-${ossRegion}.aliyuncs.com`;
    const endpointHost = rawEndpoint.replace(/^https?:\/\//, "").replace(/^s3\./, "");
    const url = `https://${BUCKET_NAME}.${endpointHost}/${normalizedKey}`;

    return { key: normalizedKey, url };
  } catch (error) {
    console.error("[Storage] Upload failed:", error);
    throw new Error(`Storage upload failed: ${error}`);
  }
}

/**
 * Get a signed URL for downloading a file from Alibaba Cloud OSS
 */
export async function storageGet(key: string): Promise<{ key: string; url: string }> {
  if (!ENV.ossAccessKeyId || !ENV.ossAccessKeySecret || !BUCKET_NAME) {
    console.warn("[Storage] OSS credentials not configured. Returning mock URL for view.");
    const normalizedKey = key.replace(/^\/+/, "");
    // Return a mock URL that won't throw 500, but obviously won't load real content if not configured
    // This prevents the entire page/component from crashing
    return { key: normalizedKey, url: `https://mock-storage.local/${normalizedKey}` };
  }

  const normalizedKey = key.replace(/^\/+/, "");

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: normalizedKey,
  });

  try {
    // Generate a signed URL valid for 1 hour (3600 seconds)
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return { key: normalizedKey, url };
  } catch (error) {
    console.error("[Storage] Get signed URL failed:", error);
    throw new Error(`Storage get failed: ${error}`);
  }
}

/**
 * Download file content from OSS
 */
export async function storageDownload(key: string): Promise<{ content: Buffer; contentType?: string }> {
    if (!ENV.ossAccessKeyId || !ENV.ossAccessKeySecret || !BUCKET_NAME) {
        throw new Error("OSS credentials not configured");
    }

    const normalizedKey = key.replace(/^\/+/, "");
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: normalizedKey,
    });

    try {
        const response = await s3Client.send(command);
        const byteArray = await response.Body?.transformToByteArray();
        if (!byteArray) throw new Error("Empty body");
        
        return { 
            content: Buffer.from(byteArray),
            contentType: response.ContentType
        };
    } catch (error) {
        console.error("[Storage] Download failed:", error);
        throw new Error(`Storage download failed: ${error}`);
    }
}
