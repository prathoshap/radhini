# Radhini Rao · Kalaashaala — website

A single-page, static website for Vidushi Radhini Rao — Bharatanatyam artist,
choreographer, Carnatic vocalist, and founder of Kalaashaala. Hand-built with
plain HTML, CSS, and JavaScript. No build step, no dependencies — it runs
anywhere that serves static files.

## What's inside

```
site/
├── index.html          # all page content
├── css/style.css       # elegant classical theme (plum / gold / blush)
├── js/main.js          # hero slideshow, scroll reveals, gallery + lightbox
├── .nojekyll           # tells GitHub Pages to serve files as-is
└── assets/img/
    ├── logo.jpg
    ├── portrait.jpg, portrait-outdoor.jpg
    ├── hero/           # 3 rotating hero images (Ken Burns)
    └── gallery/        # 24 performance & event photos
```

## Preview locally

From inside the `site/` folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Publish free on GitHub Pages

1. Create a repo (e.g. `radhini`) at <https://github.com/prathoshap>.
2. From this `site/` folder:
   ```bash
   git init
   git add .
   git commit -m "Radhini Rao website"
   git branch -M main
   git remote add origin https://github.com/prathoshap/radhini.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, select `main` / `root`, Save.
4. Live in ~1 minute at **https://prathoshap.github.io/radhini/**

### Custom domain (optional, later)
Buy a domain (e.g. `radhinirao.com`), add it under **Settings → Pages → Custom domain**,
and point a CNAME at `prathoshap.github.io`. No code changes needed.

## Editing content

- **Text** (bio, school, classes, contact): edit `index.html` directly.
- **Gallery photos & captions**: edit the `GALLERY` array at the top of `js/main.js`,
  and drop the matching image into `assets/img/gallery/`.
- **Hero images**: replace files in `assets/img/hero/`.
- **Colours**: the palette lives in the `:root` block at the top of `css/style.css`.

## Notes

- A contact *form* isn't included because GitHub Pages has no server. The Contact
  section links directly to WhatsApp, email, and phone instead. If a form is wanted
  later, a free service like Formspree or a Google Form can be embedded.
- Images are resized for fast loading; originals are kept in the parent folder.
