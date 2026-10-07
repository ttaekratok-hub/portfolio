import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("security.txt is valid for at least another month", () => {
  // RFC 9116 requires an Expires date. CI goes red a month before it lapses:
  // bump the date (max one year ahead) when that happens.
  const txt = readFileSync("site/public/.well-known/security.txt", "utf8");
  expect(txt).toMatch(/^Contact: mailto:\S+@\S+$/m);
  const expires = new Date(/^Expires: (\S+)$/m.exec(txt)![1]!);
  const days = (expires.getTime() - Date.now()) / 86_400_000;
  expect(days, `security.txt expires in ${Math.floor(days)} days`).toBeGreaterThan(30);
  expect(days, "Expires should be at most a year ahead").toBeLessThan(366);
});
