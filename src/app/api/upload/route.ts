import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/security/adminSession";
import { PERMISSIONS } from "@/lib/security/rbac";
import { recordAuditLog } from "@/lib/domain/auditLog";
import { getStorageProvider } from "@/lib/storage";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB default (images)
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];

// Audited financial statements are routinely larger than a photo, so PDFs get
// their own ceiling rather than loosening the limit for every upload.
const MAX_FILE_SIZE_BY_TYPE: Record<string, number> = {
  "application/pdf": 10 * 1024 * 1024, // 10MB
};

// The stored extension is derived from the validated MIME type, never from the
// uploaded filename. Files land in `public/uploads/`, which is served from this
// site's own origin with a Content-Type chosen by extension — so honouring a
// client-supplied `.html` on a file whose bytes merely START with a valid
// signature would publish same-origin HTML. Adding PDF widened that surface,
// because "%PDF-1.4\n<script>…" is both a passing signature and a valid page.
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

// Magic numbers for file validation (file signatures)
const FILE_SIGNATURES: Record<string, Buffer> = {
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]),
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  "image/webp": Buffer.from([0x52, 0x49, 0x46, 0x46]), // RIFF
  "image/gif": Buffer.from([0x47, 0x49, 0x46]), // GIF
  "application/pdf": Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
};

/**
 * Validates file signature (magic numbers) to prevent MIME type spoofing
 */
async function validateFileSignature(file: File, expectedType: string): Promise<boolean> {
  const signature = FILE_SIGNATURES[expectedType];
  if (!signature) return false;

  const bytes = await file.slice(0, signature.length).arrayBuffer();
  const buffer = Buffer.from(bytes);

  return buffer.subarray(0, signature.length).equals(signature);
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate against the specific capability, and capture who that is so
    // the upload can be attributed. Pet media holders may store any allowed type;
    // a content editor may store PDFs only, for the transparency page's audit
    // reports (the owner's decision, 2026-10-20).
    const mediaPrincipal = await verifyAdminSession(PERMISSIONS.MANAGE_PET_MEDIA);
    const principal = mediaPrincipal ?? (await verifyAdminSession(PERMISSIONS.MANAGE_CONTENT));
    if (!principal) {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WebP, GIF, and PDF are allowed." },
        { status: 400 }
      );
    }

    if (!mediaPrincipal && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Your role can upload PDF reports only." },
        { status: 403 }
      );
    }

    // Validate file size against this type's ceiling
    const maxSize = MAX_FILE_SIZE_BY_TYPE[file.type] ?? MAX_FILE_SIZE;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size exceeds ${Math.round(maxSize / (1024 * 1024))}MB limit` },
        { status: 400 }
      );
    }

    // Validate file signature to prevent MIME type spoofing
    const isValidSignature = await validateFileSignature(file, file.type);
    if (!isValidSignature) {
      return NextResponse.json(
        { error: "File signature validation failed. File content does not match claimed type." },
        { status: 400 }
      );
    }

    // Generate unique, sanitized filename. The base name keeps no dots, so the
    // extension below is the only one the stored file can have.
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const extension = EXTENSION_BY_TYPE[file.type];
    if (!extension) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const baseName =
      file.name
        .replace(/\.[^.]*$/, "")
        .replace(/[^a-z0-9-]/gi, "_")
        .slice(0, 60) || "upload";
    const filename = `${timestamp}-${randomStr}-${baseName}.${extension}`;

    // Read bytes into Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Delegate to active StorageProvider
    const storageProvider = getStorageProvider();
    const result = await storageProvider.uploadFile(buffer, filename, file.type);

    // Writing a file to shelter storage is a privileged mutation, and
    // LAYERS.md §9 rule 5 wants one of these on every such mutation. It could
    // not be written before: this handler was gated by a boolean and had no
    // actor to name. `authMethod` is carried explicitly so a reader can tell an
    // upload made by a signed-in admin from one made with the shared secret.
    recordAuditLog({
      actorId: principal.id,
      actorEmail: principal.email,
      actorRole: principal.role,
      action: "FILE_UPLOADED",
      entity: "File",
      entityId: result.filename,
      details: {
        authMethod: principal.authMethod,
        originalName: file.name,
        contentType: file.type,
        size: result.size,
        provider: result.provider,
      },
    });

    return NextResponse.json(
      {
        success: true,
        url: result.url,
        filename: result.filename,
        size: result.size,
        provider: result.provider,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Upload error:", error);

    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const principal = await verifyAdminSession(PERMISSIONS.MANAGE_PET_MEDIA);
    if (!principal) {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      );
    }

    let filename: string | null = null;

    const { searchParams } = new URL(request.url);
    filename = searchParams.get("filename");

    if (!filename) {
      try {
        const body = await request.json();
        filename = body.filename || null;
      } catch {
        // No json body
      }
    }

    if (!filename) {
      return NextResponse.json(
        { error: "Filename parameter is required" },
        { status: 400 }
      );
    }

    const storageProvider = getStorageProvider();
    const ok = await storageProvider.deleteFile(filename);

    // Recorded whether or not the file was there: an authorized attempt to
    // remove shelter media is the fact worth keeping, and `deleted` says how it
    // turned out.
    recordAuditLog({
      actorId: principal.id,
      actorEmail: principal.email,
      actorRole: principal.role,
      action: "FILE_DELETED",
      entity: "File",
      entityId: filename,
      details: { authMethod: principal.authMethod, deleted: ok },
    });

    return NextResponse.json({ success: ok });
  } catch (error) {
    console.error("Delete file error:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
