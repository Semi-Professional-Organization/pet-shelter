import * as z from "zod";
import {
  isSafeImageUrl,
  isSafeQrImageUrl,
  qrPayloadByteLength,
  QR_PAYLOAD_MAX_LENGTH,
} from "@/lib/domain/qrCode";

/**
 * Shared validators for image locations produced by `/api/upload`.
 *
 * `/api/upload` returns a same-origin path like `/uploads/1730-ab12-qr.webp`.
 * A bare `z.string().url()` rejects that path outright while happily accepting
 * `javascript:alert(1)`, so every image field in the app uses these instead.
 *
 * Pet photos and QR codes get different rules: a photo may sit at any
 * same-origin path (legacy `/images/...` assets included), while a QR must come
 * from `/uploads/` or a hosted URL.
 */

const IMAGE_URL_MESSAGE =
  "Must be a same-origin path or an absolute http(s) URL";
const QR_URL_MESSAGE =
  "Must be an uploaded image path (/uploads/...) or an absolute http(s) URL";

/** A required pet image location. */
export const uploadedImageUrl = z
  .string()
  .trim()
  .min(1, "An image is required")
  .refine(isSafeImageUrl, IMAGE_URL_MESSAGE);

/** An optional pet image location. Empty string means "not set". */
export const optionalUploadedImageUrl = z
  .string()
  .trim()
  .refine((value) => value === "" || isSafeImageUrl(value), IMAGE_URL_MESSAGE)
  .optional()
  .default("");

/**
 * A donation QR image location, or `""` for "not set". Required as written; `optionalQrImageUrl`
 * below is the usual form. The pet edit schema uses this bare one so that an omitted QR stays
 * absent rather than defaulting to `""`, which the edit would read as "clear it".
 */
export const qrImageUrlOrEmpty = z
  .string()
  .trim()
  .refine((value) => value === "" || isSafeQrImageUrl(value), QR_URL_MESSAGE);

/** An optional donation QR image location. Empty string means "not set". */
export const optionalQrImageUrl = qrImageUrlOrEmpty.optional().default("");

/**
 * An optional payment payload rendered into a QR code.
 *
 * Capped on encoded bytes rather than UTF-16 units, because QR capacity is a
 * byte budget and a multi-byte character costs more than one.
 */
export const optionalQrPayload = z
  .string()
  .trim()
  .refine(
    (value) => qrPayloadByteLength(value) <= QR_PAYLOAD_MAX_LENGTH,
    `Payment payload must be ${QR_PAYLOAD_MAX_LENGTH} bytes or fewer`
  )
  .optional()
  .default("");
