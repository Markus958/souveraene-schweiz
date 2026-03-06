# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Souveräne Schweiz" is a static HTML/CSS website (no build system, no framework, no npm) providing political analysis on Swiss domestic issues. All pages are in German.

Two main content sections:
- `ch-eu/` — Analysis of the Switzerland–EU bilateral agreements package (11 treaties)
- `10mio/` — Analysis of Switzerland's projected population growth to 10 million

## Architecture

### Stylesheet
`style.css` at the root is the **single shared stylesheet** for the entire site. It defines:
- CSS custom properties in `:root` (colors, etc.)
- Global resets, typography, nav, breadcrumb, page-hero, footer, buttons, content layout (`.content-wrap` grid + `.sidebar`), and responsive breakpoints

Page-specific styles are written inline in `<style>` tags within each HTML file. Subdirectory pages reference the stylesheet as `../style.css`.

### Color Themes
| Context | Variable / Value |
|---|---|
| Brand red | `var(--rot)` = `#C8102E` |
| CH-EU Binnenmarkt | `#1a3f6e` (dark navy) |
| CH-EU secondary | `#7a9bb5` |
| 10 Mio section | `--gruen: #2d6a2d` (defined locally in page `<style>`) |

### Page Structure Pattern
Every page follows this structure:
1. `<nav>` — sticky top nav with `.nav-logo`, `.nav-links`, `.nav-x` (X/Twitter link), `.hamburger`
2. `.mobile-menu#mobileMenu` — hidden off-canvas mobile menu
3. `<nav class="breadcrumb">` — breadcrumb trail
4. `.page-hero` — title area with `.page-label`, `h1`, `.lead`
5. `<hr class="divider">` — horizontal rule separator
6. Main content (varies by page)
7. `<footer>` — standard footer
8. `<script>` — `toggleMenu()` function for hamburger menu (repeated on each page)

### Content Layout (article pages)
Detail pages under `ch-eu/` use the `.content-wrap` CSS grid: a main `.article-body` column and a sticky `.sidebar` with `.sidebar-nav` linking to all CH-EU topics.

Active nav links use the class `aktiv`.

### Placeholder Content
Many article pages contain `<div class="placeholder-block">` elements marking content yet to be written.

## Adding a New Page

When creating a new article page (e.g. in `ch-eu/`):
1. Copy the structure from an existing page like `ch-eu/mra.html`
2. Set `href="../style.css"` for the stylesheet
3. Mark the correct nav link with class `aktiv`
4. Add a 3-level breadcrumb (Start / Section / Page title)
5. Use `.content-wrap` grid with `.article-body` and `.sidebar`
6. Add the page to the sidebar nav list in all other `ch-eu/` article pages
7. Add the page link to `ch-eu/index.html` tile grid

## Fonts
Google Fonts: **Playfair Display** (headings/display) and **Source Sans 3** (body). Both are loaded via `<link>` in every page's `<head>`.
