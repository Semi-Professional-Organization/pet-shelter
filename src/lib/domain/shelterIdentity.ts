/**
 * Single source of truth for the shelter's contact identifiers.
 *
 * Until 2026-11-05 this file also held two ROS registration numbers, an LHDN tax-deductible
 * approval reference and a society legal name. The owner confirmed that day that the
 * shelter is not a registered society and holds no tax-deductible approval (#239, #249), so
 * they are gone, and `tests/unit/shelterIdentity.test.ts` fails if a literal of either shape
 * reappears in `src/`. Bring them back only from a real certificate:
 * `tasks/decisions/2026-11-05-a-reconciled-gift-earns-an-acknowledgement-not-a-tax-receipt.md`.
 */

/**
 * The coordinator's WhatsApp number, in the international form `wa.me` requires: country code,
 * no leading 0, no `+`, no spaces. A local number such as `010-550 3056` is `60105503056`;
 * `wa.me/0105503056` does not open a chat.
 *
 * Every public WhatsApp link builds on {@link SHELTER_WHATSAPP_URL}. Before 2026-10-20 nine links
 * across six files each spelled out a made-up number (`60123456789`, and `60127876543` on every
 * pet page), and they stayed live because there was nowhere single to change them.
 * `tests/unit/shelterIdentity.test.ts` fails if a hard-coded `wa.me/<digits>` link reappears
 * anywhere in `src/` outside this file.
 */
export const SHELTER_WHATSAPP_NUMBER = "60105503056";

/** {@link SHELTER_WHATSAPP_NUMBER} as people read it, for visible text. */
export const SHELTER_WHATSAPP_DISPLAY = "+60 10-550 3056";

/** Base `wa.me` link. Append `?text=<url-encoded message>` to pre-fill a chat. */
export const SHELTER_WHATSAPP_URL = `https://wa.me/${SHELTER_WHATSAPP_NUMBER}`;

/**
 * The shelter's phone number for calls, the same line as WhatsApp (the owner's choice,
 * 2026-10-20). Before then every "Call" link, the navbar, the footer, the FAQ banner, the default
 * settings, the translations and every outgoing email printed `03-7876 5432`, a landline
 * nobody had confirmed, from sixteen separate copies.
 */
export const SHELTER_PHONE_TEL = `+${SHELTER_WHATSAPP_NUMBER}`;

/** {@link SHELTER_PHONE_TEL} as people read it. */
export const SHELTER_PHONE_DISPLAY = SHELTER_WHATSAPP_DISPLAY;
