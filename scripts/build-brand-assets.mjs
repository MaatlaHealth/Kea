/**
 * Generates the brand image derivatives used across the product from the single
 * source logo. Run with: node scripts/build-brand-assets.mjs
 *
 * The source file is never modified and its proportions are preserved. The
 * icon only derivative is a square crop of the mother and child mark.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, "KEA Logo.png");
const brandDir = path.join(root, "public", "brand");
const appDir = path.join(root, "src", "app");

const PLUM = { r: 85, g: 32, b: 92 };
const WARM_WHITE = { r: 252, g: 250, b: 249, alpha: 1 };

async function main() {
  await mkdir(brandDir, { recursive: true });

  const image = sharp(source);
  const meta = await image.metadata();
  console.log(`source: ${meta.width}x${meta.height}`);

  // Full lockup, trimmed of transparent padding, at two widths.
  const trimmed = await sharp(source).trim({ threshold: 8 }).toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();
  console.log(`trimmed: ${trimmedMeta.width}x${trimmedMeta.height}`);

  await sharp(trimmed)
    .resize({ width: 1200, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(path.join(brandDir, "kea-logo.png"));

  await sharp(trimmed)
    .resize({ width: 480, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(path.join(brandDir, "kea-logo-sm.png"));

  // Icon only mark: the leftmost region of the trimmed lockup, cropped to the
  // circular mother and child device and stopping before the word mark.
  const markWidth = Math.round(trimmedMeta.height * 0.84);
  const mark = await sharp(trimmed)
    .extract({
      left: 0,
      top: 0,
      width: Math.min(markWidth, trimmedMeta.width),
      height: trimmedMeta.height,
    })
    .trim({ threshold: 8 })
    .toBuffer();

  await sharp(mark)
    .resize({ width: 512, height: 512, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(brandDir, "kea-mark.png"));

  // Wordmark: the mark plus the word "Kea", stopping before the vertical rule
  // and the tagline. The tagline is unreadable at navigation size, so the
  // header uses this derivative and the footer uses the full lockup.
  const ruleX = Math.round(trimmedMeta.width * 0.635);
  const wordmark = await sharp(trimmed)
    .extract({ left: 0, top: 0, width: ruleX, height: trimmedMeta.height })
    .trim({ threshold: 8 })
    .toBuffer();

  await sharp(wordmark)
    .resize({ width: 760, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(path.join(brandDir, "kea-wordmark.png"));

  // Favicon and app icons on a solid warm white tile so the mark stays legible.
  for (const [size, name] of [
    [32, "icon.png"],
    [180, "apple-icon.png"],
  ]) {
    await sharp(mark)
      .resize({
        width: Math.round(size * 0.82),
        height: Math.round(size * 0.82),
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: Math.round(size * 0.09),
        bottom: Math.round(size * 0.09),
        left: Math.round(size * 0.09),
        right: Math.round(size * 0.09),
        background: WARM_WHITE,
      })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(path.join(appDir, name));
  }

  // Open Graph image: the lockup centred on a warm white canvas with a plum rule.
  const ogWidth = 1200;
  const ogHeight = 630;
  const logoForOg = await sharp(trimmed)
    .resize({ width: 760, withoutEnlargement: true })
    .toBuffer();
  const logoMeta = await sharp(logoForOg).metadata();

  const caption = `<svg width="${ogWidth}" height="${ogHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${ogWidth}" height="10" fill="rgb(${PLUM.r},${PLUM.g},${PLUM.b})"/>
  <rect x="0" y="${ogHeight - 10}" width="${ogWidth}" height="10" fill="#009F9C"/>
  <text x="${ogWidth / 2}" y="${ogHeight - 86}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#4a4551">
    Every maternal referral deserves a confirmed outcome
  </text>
</svg>`;

  await sharp({
    create: {
      width: ogWidth,
      height: ogHeight,
      channels: 4,
      background: WARM_WHITE,
    },
  })
    .composite([
      {
        input: logoForOg,
        left: Math.round((ogWidth - (logoMeta.width ?? 760)) / 2),
        top: Math.round((ogHeight - (logoMeta.height ?? 240)) / 2) - 40,
      },
      { input: Buffer.from(caption), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(brandDir, "og-image.png"));

  // Maskable PWA icon with a plum background.
  await sharp(mark)
    .resize({ width: 400, height: 400, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 56, bottom: 56, left: 56, right: 56, background: WARM_WHITE })
    .png({ compressionLevel: 9 })
    .toFile(path.join(brandDir, "kea-icon-512.png"));

  await writeFile(
    path.join(brandDir, "README.md"),
    [
      "# Brand assets",
      "",
      "These files are generated from `KEA Logo.png` in the repository root by",
      "`node scripts/build-brand-assets.mjs`. Do not edit them by hand.",
      "",
      "| File | Use |",
      "| --- | --- |",
      "| `kea-logo.png` | Full lockup for the website header and footer |",
      "| `kea-logo-sm.png` | Smaller lockup for dense layouts |",
      "| `kea-mark.png` | Icon only mark for the application shell |",
      "| `kea-icon-512.png` | Application icon |",
      "| `og-image.png` | Open Graph and social preview image |",
      "",
      "The source logo is not modified and its proportions are preserved.",
      "",
    ].join("\n"),
    "utf-8",
  );

  console.log("brand assets written to public/brand and src/app");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
