import type { StaticImageData } from "next/image";

/**
 * The family photo shown on signed-in pages (never on the public landing page).
 *
 * To add it: save the photo as apps/web/assets/family-photo.jpg, then replace the
 * two lines below with:
 *
 *   import photo from "@/assets/family-photo.jpg";
 *   export const familyPhoto: { image: StaticImageData; caption: string } | null = { image: photo, caption: "Christmas 2025" };
 *
 * Imported images get a hashed, unguessable URL, so the photo isn't sitting at a
 * predictable public address.
 */
export const familyPhoto: { image: StaticImageData; caption: string } | null = null;
