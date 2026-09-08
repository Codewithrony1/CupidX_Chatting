import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export async function GET(
  req: Request,
  props: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await props.params;
    if (!pathSegments || pathSegments.length === 0) {
      return NextResponse.json({ error: 'File path required' }, { status: 400 });
    }

    // Security: sanitize path segments to prevent directory traversal
    const safeSegments = pathSegments.map((s) => s.replace(/[^a-zA-Z0-9._-]/g, ''));
    if (safeSegments.some((s) => s.includes('..') || !s)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const relativePath = path.join(...safeSegments);

    const cwd = process.cwd();
    const publicUploads = path.join(cwd, 'public', 'uploads');
    const rootUploads = path.join(cwd, 'uploads');
    const tmpUploads = path.join('/tmp', 'uploads');

    // Check multiple potential upload directories
    const candidatePaths = [
      path.resolve(publicUploads, relativePath),
      path.resolve(rootUploads, relativePath),
      path.resolve(tmpUploads, relativePath),
    ];

    let targetFilePath: string | null = null;
    for (const candidate of candidatePaths) {
      if (
        (candidate.startsWith(publicUploads) ||
          candidate.startsWith(rootUploads) ||
          candidate.startsWith(tmpUploads)) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
      ) {
        targetFilePath = candidate;
        break;
      }
    }

    if (!targetFilePath) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const ext = path.extname(targetFilePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const fileBuffer = fs.readFileSync(targetFilePath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Content-Disposition': 'inline',
      },
    });
  } catch (error) {
    console.error('Upload asset serving error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
