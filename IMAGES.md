# Adding project images

Images are stored locally in `images/` and referenced from the CSV — never link
directly to an image on someone else's website (those links break over time).

## Steps for a new project

1. Save the photo into `images/`, named after the project using the same slug
   rules the site already uses for share links:
   - lowercase
   - spaces and punctuation → hyphens
   - `&` → `and`
   - e.g. "Queens Quay Heat Network" → `images/queens-quay-heat-network.jpg`
2. Keep it web-sized: longest side ~1200px is plenty (the detail panel displays
   it at 380px wide). Re-export or resize larger source files before saving.
3. In `UK Heat pump Map Database.csv`, set that project's `Image URL` column to
   the relative path, e.g. `images/queens-quay-heat-network.jpg` — not a full
   URL.
4. If two projects share one photo, point both rows at the same file in
   `images/` rather than duplicating it.

## Sourcing photos

- Vendor/manufacturer case-study photos and your own project photography are
  fine to store locally.
- Be careful with press/news photography (BBC, Reuters, newspapers, stock
  photo sites, ArchDaily, LinkedIn post images, etc.) — these are usually
  under tighter copyright than a manufacturer's own marketing image, so
  rehosting a permanent copy is a bigger step than linking to it. If you don't
  have a licence, either leave the `Image URL` as the original external link
  (it'll display but is more likely to break someday), or leave it blank.
- Broken/unavailable images degrade gracefully — the site falls back to a
  "no image" placeholder rather than a broken-image icon (see
  `script.js`, `showProjectDetails`).
