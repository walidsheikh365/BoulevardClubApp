import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { expect, it } from "vitest";

it("exports source-based vector paths with no font or external-image dependency", async () => {
  for (const name of ["wordmark", "wordmark-light", "monogram"]) {
    const svg = await readFile(new URL(`../public/brand/${name}.svg`, import.meta.url), "utf8");
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/<text|<image|<script|font-family|href=/);
    if (name !== "monogram") expect(svg).toContain("restored from the club photograph");
  }
});
it("exports a high-resolution transparent PNG and all required icon sizes", async () => {
  const wordmark = await sharp("public/brand/wordmark.png").metadata();
  expect(wordmark.width).toBe(2400);
  expect(wordmark.hasAlpha).toBe(true);
  for (const size of [180, 192, 512]) {
    const icon = await sharp(`public/icons/icon-${size}.png`).metadata();
    expect(icon.width).toBe(size);
    expect(icon.height).toBe(size);
  }
});
