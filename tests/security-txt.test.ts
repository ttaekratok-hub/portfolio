// security.txt is a standard file (RFC 9116) at /.well-known/security.txt that
// tells security researchers how to report a vulnerability they find on the
// site. Vite copies it from site/public/.well-known/ unchanged, nginx.conf
// serves it as plain text, and the CI smoke test fetches it from the running
// container.
//
// This test depends on the date, not just the code: it can fail on a day when
// nothing changed. That's on purpose; CI acts as the reminder.
// Learn more: https://www.rfc-editor.org/rfc/rfc9116
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("security.txt is valid for at least another month", () => {
  // RFC 9116 requires an Expires date. CI goes red a month before it lapses:
  // bump the date (max one year ahead) when that happens.
  // Past that date, readers should treat the file as stale and not trust it;
  // the RFC recommends a date less than a year ahead.
  const txt = readFileSync("site/public/.well-known/security.txt", "utf8");
  // The `m` flag makes ^ and $ match at the start and end of every line.
  expect(txt).toMatch(/^Contact: mailto:\S+@\S+$/m);
  // exec() returns the match, or null if there's none. [1] is the text
  // captured by ( ), the date itself.
  const expires = new Date(/^Expires: (\S+)$/m.exec(txt)![1]!);
  // Milliseconds in a day: 24 * 60 * 60 * 1000. The _ is a digit separator,
  // only there for readability.
  const days = (expires.getTime() - Date.now()) / 86_400_000;
  expect(days, `security.txt expires in ${Math.floor(days)} days`).toBeGreaterThan(30);
  expect(days, "Expires should be at most a year ahead").toBeLessThan(366);
});
