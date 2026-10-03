# The Boulevard Club — brand foundation

## Wordmark restoration

The [supplied photograph](graphics/image.png) is the source of the logo, **not a replacement typeface**.

[Generate script](scripts/generate-brand.mjs) isolates the ink from the padded post, applies an inverse cylindrical projection, corrects the bowed baselines and edge foreshortening, and traces the resulting contours into vector paths. The visible `Bouleva`, `Club`, and handwritten `The` retain the photographed letterforms.

The obscured **r** is reconstructed with a matching high-contrast stem and curled terminal. The **d** is assembled from the photograph's own **o** bowl and **l** ascender. These two letters are reconstructions, not recovered hidden pixels. The source is only 527 × 541 pixels and the capital letters are approximately 50 pixels high: this is a source-based restoration, not a claim to possess the original master artwork. Some original edge character remains.

The monogram uses the photographed **B** and **C**. The third-party equipment branding and background are excluded.

### Deliverables

| Asset | Use |
| --- | --- |
| [Dark SVG wordmark](public/brand/wordmark.svg) | Primary transparent vector; scales without installed fonts |
| [Light SVG wordmark](public/brand/wordmark-light.svg) | Dark backgrounds and sign-in panel |
| [Transparent PNG](public/brand/wordmark.png) | 2400-pixel-wide raster export |
| [Ivory preview](public/brand/wordmark-preview.png) | Easy visual review |
| [BC monogram](public/brand/monogram.svg) | Compact identity and home-screen icon source |
| [180 px](public/icons/icon-180.png), [192 px](public/icons/icon-192.png), [512 px](public/icons/icon-512.png) | Apple touch and PWA icons |

Regenerate with `npm run brand`. It reads the original photo locally; it does not send the image to an external service.

Keep at least one lowercase-letter height of clear space around the wordmark. Use the monogram where the full name would be too small. Do not stretch, shadow, outline, or recolor individual letters. App icons intentionally use a simple monogram rather than shrinking the full wordmark into an unreadable square.

## Color palette

The photo establishes the black-on-light identity. Warm ivory and muted court green are a complementary interface palette inspired by the club setting, **not exact color samples from an original brand manual**.

| Token | Hex | Application |
| --- | --- | --- |
| Ink | `#20251F` | Wordmark, primary text |
| Warm ivory | `#F7F5EF` | App background |
| Paper | `#FFFEFA` | Cards, fields |
| Court green | `#3F5848` | Primary buttons, selected facility, active navigation |
| Sage tint | `#EDF0E7` | Quiet panels and member indicators |
| Court illustration | `#DCE3D2` | Hero artwork background |
| Muted text | `#6B7268` | Secondary copy |
| Hairline | `#E2E4DA` | Dividers and borders |
| Premium sand | `#F0EAD8` | Premium badge background |
| Premium ink | `#79653D` | Premium badge text and icon |

Color is never the only status indicator: the app includes labels, icons, and disabled states.

## Interface typography

- **Logo:** source-image outlines; no font substitution.
- **Headings:** DM Serif Display Regular. A companion editorial serif, not a claim to identify the original logo font.
- **Controls and body:** Manrope, weights 400–700.
- **Small labels:** Manrope Semibold/Bold with restrained letter spacing.

Fonts are bundled locally through Fontsource; the app does not fetch Google Fonts at runtime. SIL Open Font License notices are included in [licenses](public/brand/licenses).

## UI character

Warm, quiet, and personal: generous spacing, thin dividers, restrained rounding, short copy, and no decorative gradients or heavy shadows. The home screen prioritizes the next game, facility choice, and a ten-slot daily calendar. The interface responds to desktop and phone widths, respects reduced-motion settings, and keeps operating times explicitly in Pakistan time.
