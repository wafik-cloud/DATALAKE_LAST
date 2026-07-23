import crypto from 'crypto';
import { Readable } from 'stream';
import * as Minio from 'minio';
import { env } from '../config/env';

export type ObjectMetadata = Record<string, string>;

export interface UploadObjectInput {
  key: string;
  body: Readable | Buffer | string;
  size?: number;
  contentType?: string;
  metadata?: ObjectMetadata;
}

export class MinioStorageService {
  private readonly client: Minio.Client;

  constructor() {
    this.client = new Minio.Client({
      endPoint: env.minio.host,
      port: env.minio.port,
      useSSL: env.minio.useSSL,
      accessKey: env.minio.accessKey,
      secretKey: env.minio.secretKey,
      region: env.minio.region,
    });
  }

  async initializeBucket(): Promise<void> {
    const exists = await this.client.bucketExists(env.minio.bucket);
    if (!exists) {
      await this.client.makeBucket(env.minio.bucket, env.minio.region);
    }
  }

  async testConnection(): Promise<{ ok: boolean; bucket: string; message: string }> {
    await this.initializeBucket();
    const exists = await this.client.bucketExists(env.minio.bucket);
    if (!exists) {
      throw new Error(`Bucket introuvable: ${env.minio.bucket}`);
    }
    return {
      ok: true,
      bucket: env.minio.bucket,
      message: 'Connexion MinIO opérationnelle',
    };
  }

  async uploadObject(input: UploadObjectInput): Promise<{ key: string; etag?: string }> {
    const metaData: ObjectMetadata = {
      ...(input.metadata || {}),
    };

    const result = await this.client.putObject(
      env.minio.bucket,
      input.key,
      input.body,
      input.size,
      {
        'Content-Type': input.contentType || 'application/octet-stream',
        ...metaData,
      }
    );

    return { key: input.key, etag: result.etag };
  }

  async downloadObject(key: string): Promise<Readable> {
    return this.client.getObject(env.minio.bucket, key);
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.removeObject(env.minio.bucket, key);
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(env.minio.bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  async listObjects(prefix = ''): Promise<Minio.BucketItem[]> {
    const items: Minio.BucketItem[] = [];
    const stream = this.client.listObjectsV2(env.minio.bucket, prefix, true);
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (item) => items.push(item));
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });
    return items;
  }

  async getObjectMetadata(key: string) {
    const stat = await this.client.statObject(env.minio.bucket, key);
    return {
      key,
      size: stat.size,
      etag: stat.etag,
      lastModified: stat.lastModified,
      metadata: stat.metaData,
    };
  }

  async generatePresignedDownloadUrl(key: string, expirySeconds = 900): Promise<string> {
    return this.client.presignedGetObject(env.minio.bucket, key, expirySeconds);
  }

  static sha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}

export const minioStorageService = new MinioStorageService();
