import fs from "node:fs/promises";
import sharp from "sharp";
import ImageTracer from "imagetracerjs";

const { data: source, info } = await sharp("graphics/image.png").removeAlpha().raw().toBuffer({ resolveWithObject: true });
const INK = "#20251f";
const PAPER = "#f7f5ef";
const SCALE = 5;
const CENTER = 158;
const RADIUS = 108;
const arc = (x) => RADIUS * Math.asin((x - CENTER) / RADIUS);

function sample(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const gray = (px, py) => {
    const offset = (py * info.width + px) * info.channels;
    return (source[offset] + source[offset + 1] + source[offset + 2]) / 3;
  };
  return gray(ix, iy) * (1 - fx) * (1 - fy) + gray(ix + 1, iy) * fx * (1 - fy)
    + gray(ix, iy + 1) * (1 - fx) * fy + gray(ix + 1, iy + 1) * fx * fy;
}

async function trace({ left, right, top, bottom, curvature = 0, cylindrical = true, include = () => true }) {
  const start = cylindrical ? arc(left) : left;
  const width = Math.ceil(((cylindrical ? arc(right) : right) - start) * SCALE);
  const height = Math.ceil((bottom - top) * SCALE);
  const pixels = new Uint8Array(width * height);
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = cylindrical ? CENTER + RADIUS * Math.sin((start + x / SCALE) / RADIUS) : left + x / SCALE;
      // Inverse cylindrical projection restores the lettering wrapped around the padded post.
      const baseline = curvature === .0012 ? 293 : 353;
      const depthScale = 1 - .000012 * (sx - 155) ** 2;
      const flatY = top + y / SCALE;
      const sy = (curvature ? baseline + (flatY - baseline) * depthScale : flatY) - curvature * (sx - 155) ** 2;
      const black = include(sx, sy) && sample(sx, sy) < 91;
      pixels[y * width + x] = black ? 0 : 255;
      if (black) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;
  const rgba = await sharp(pixels, { raw: { width, height, channels: 1 } })
    .extract({ left: minX, top: minY, width: croppedWidth, height: croppedHeight })
    .blur(2.2).threshold(128).toColourspace("srgb").ensureAlpha().raw().toBuffer();
  const svg = ImageTracer.imagedataToSVG({ width: croppedWidth, height: croppedHeight, data: rgba }, {
    ltres: 0.1, qtres: 2.5, pathomit: 18, roundcoords: 2, rightangleenhance: false,
    colorsampling: 0, numberofcolors: 2, colorquantcycles: 1,
    pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }],
    strokewidth: 0, linefilter: false, desc: false
  });
  const paths = [...svg.matchAll(/<path\b[^>]*>/g)].map(([tag]) => tag)
    .filter((tag) => tag.includes('fill="rgb(0,0,0)"'))
    .map((tag) => tag.replace(/fill="[^"]*"/, 'fill="currentColor"').replace(/stroke="[^"]*"/, 'stroke="none"')).join("");
  if (!paths) throw new Error("No source lettering was traced. Check the source image and crop.");
  return { paths, width: croppedWidth / SCALE, height: croppedHeight / SCALE };
}
const mainMask = (x, y) => !(x > 98 && x < 143 && y < 252);
const clubMask = (x, y) => y >= (x < 181 ? 300 : x < 200 ? 294 : x < 233 ? 305 : 289);
const [the, bouleva, club, letterB, letterO, letterL, letterC] = await Promise.all([
  trace({ left: 90, right: 137, top: 200, bottom: 245, cylindrical: false, include: (x, y) => !(x < 100 && y >= 235) }),
  trace({ left: 65, right: 258.2, top: 232, bottom: 298, curvature: .0012, include: mainMask }),
  trace({ left: 137, right: 255, top: 294, bottom: 359, curvature: .002, include: clubMask }),
  trace({ left: 65, right: 99, top: 232, bottom: 298, curvature: .0012 }),
  trace({ left: 98, right: 132, top: 251, bottom: 298, curvature: .0012, include: mainMask }),
  trace({ left: 171, right: 188, top: 232, bottom: 298, curvature: .0012 }),
  trace({ left: 137, right: 183, top: 298, bottom: 359, curvature: .002, include: clubMask })
]);
const place = (glyph, x, y, width = glyph.width, height = glyph.height) =>
  `<g transform="translate(${x} ${y}) scale(${width / glyph.width / SCALE} ${height / glyph.height / SCALE})">${glyph.paths}</g>`;
const baseline = 105;
const rX = 16 + bouleva.width + 1;
const dX = rX + 29;
const right = dX + 40;
const viewWidth = right + 16;

// The missing r is redrawn to match the photographed high-contrast stem and curled terminal.
const reconstructedR = `<path fill="currentColor" d="M0 5 13 1 13 12C17 3 22-1 28 1C35 4 29 16 23 13C20 12 20 9 21 7C17 8 14 13 13 18V37L18 39V40H0V39L3 37V9Z"/>`;
// Build the missing d from the photograph's own o bowl and l ascender, not a replacement font.
const reconstructedD = place(letterO, dX, baseline - 37, 34, 37) + place(letterL, dX + 24, baseline - 54, 16, 54);
const artwork = [
  place(the, 49, 3, the.width * 1.04, 44),
  place(bouleva, 16, baseline - bouleva.height),
  `<g transform="translate(${rX} ${baseline - 37}) scale(1 .925)">${reconstructedR}</g>`,
  reconstructedD,
  place(club, right - club.width * 1.08, 114, club.width * 1.08, 62)
].join("");
const wordmark = (color, background = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} 190" role="img" aria-labelledby="title"><title id="title">The Boulevard Club - restored from the club photograph</title>${background ? `<rect width="${viewWidth}" height="190" fill="${background}"/>` : ""}<g color="${color}">${artwork}</g></svg>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${INK}"/><circle cx="256" cy="256" r="192" fill="none" stroke="#b7c2a6" stroke-width="2"/><g color="${PAPER}">${place(letterB, 126, 155, 147, 198)}${place(letterC, 245, 228, 132, 156)}</g></svg>`;

await fs.mkdir("public/brand", { recursive: true });
await fs.mkdir("public/icons", { recursive: true });
await fs.mkdir("public/brand/licenses", { recursive: true });
await fs.writeFile("public/brand/wordmark.svg", wordmark(INK));
await fs.writeFile("public/brand/wordmark-light.svg", wordmark(PAPER));
await fs.writeFile("public/brand/monogram.svg", icon);
await sharp(Buffer.from(wordmark(INK))).resize({ width: 2400 }).png().toFile("public/brand/wordmark.png");
await sharp(Buffer.from(wordmark(INK, PAPER))).resize({ width: 1600 }).png().toFile("public/brand/wordmark-preview.png");
for (const size of [180, 192, 512]) {
  await sharp(Buffer.from(icon)).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}
for (const font of ["manrope", "dm-serif-display"]) {
  await fs.copyFile(`node_modules/@fontsource/${font}/LICENSE`, `public/brand/licenses/${font}.txt`);
}
console.log(`Restored source lettering with cylindrical unwarping, reconstructed rd, and generated SVG/PNG/app icons (${viewWidth.toFixed(1)} × 190).`);
