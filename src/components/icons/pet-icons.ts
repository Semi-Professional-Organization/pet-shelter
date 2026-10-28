import { createLucideIcon } from "lucide-react";

/**
 * Shelter icons that no open icon set provides, drawn to Lucide's icon specification
 * (24px grid, 2px stroke, at least 1px canvas padding and 2px between parts) so they sit
 * beside the built-in icons unnoticed. `createLucideIcon` gives them the same props and
 * the same `lucide` class as every other Lucide icon.
 */

/**
 * Litter box trained: the top of Lucide's `cat` outline, cut at the tray rim (y=14), over a
 * litter tray. The eyes move up from y=14 to y=9.5 and the nose is dropped, so a later
 * Lucide `cat` update cannot be copied in as it stands.
 */
export const LitterBox = createLucideIcon("litter-box", [
  ["path", { d: "M3 14v-.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44V14", key: "cat" }],
  ["path", { d: "M2 14h20", key: "rim" }],
  ["path", { d: "M3 14l1 6q.2 2 2 2h12q1.8 0 2-2l1-6", key: "tray" }],
  ["path", { d: "M8 9.5v.5", key: "eye-l" }],
  ["path", { d: "M16 9.5v.5", key: "eye-r" }],
  ["path", { d: "M8 18h.01", key: "litter-l" }],
  ["path", { d: "M12 18h.01", key: "litter-c" }],
  ["path", { d: "M16 18h.01", key: "litter-r" }],
]);

/**
 * House trained: Lucide's `house` outline, check placed where `house-heart` puts its heart.
 * Not for the adoption home check / home visit step, which needs an icon of its own.
 */
export const HouseCheck = createLucideIcon("house-check", [
  ["path", { d: "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", key: "house" }],
  ["path", { d: "m9 14 2 2 4-4", key: "check" }],
]);
