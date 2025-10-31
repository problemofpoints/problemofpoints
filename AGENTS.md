# Agent Runbook

## Project Overview
- This repository contains the Quarto source for [problemofpoints.com](https://www.problemofpoints.com), a static site generated from `.qmd` sources and lightweight HTML tools.
- Content lives in two main areas: long-form posts under `posts/` and interactive utilities under `tools/`.
- Rendering relies on the Quarto CLI plus Python 3.12 and the packages pinned in `requirements.txt`.
- You have access to Netlify Functions for server-side API calls, with secrets managed via environment variables.
- The site is deployed automatically on Netlify when changes are pushed to the `main` branch.
- You have access to the internet if you need to search for information or resources.

## Local Environment
- Install Quarto separately if it is not already available on the machine.
- Create and activate a Python 3.12 virtual environment, then install dependencies:
  ```bash
  python3.12 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  ```
- Render or preview the site with `quarto render` or `quarto preview`. Quarto reads `_quarto.yml` to discover project structure.
- Deactivate the environment with `deactivate` when finished. Commit changes and rendered artifacts according to the site's publishing workflow.

## Creating a Blog Post
1. **Name the folder**: Use `YYYY-MM-DD-descriptive-slug` (lowercase, words separated by hyphens). Place it under `posts/`.
2. **Create `index.qmd`** in the new folder. Begin with front matter similar to:
   ```yaml
   ---
   title: "Concise, Descriptive Title"
   date: today's date 
   categories: [analysis, insurance]
   subtitle: "Optional subtitle"
   draft: false
   ---
   ```
3. **Write content** below the front matter using standard Quarto Markdown. By default posts inherit options from `posts/_metadata.yml` (`freeze: true`, no table of contents, etc.).
4. **Embed computations** by adding Python code chunks. Quarto will respect the global `freeze` setting; to force re-execution set `freeze: false` in the front matter or `execute: { eval: true }`.
5. **Reference static assets** by placing images or data within the post folder and linking relatively (`![Alt text](figure.png)`).
6. **Test the build**: Run `quarto render posts/your-post-slug/index.qmd` to ensure there are no errors. Fix any issues that arise.
7. **Revise commentary**: After running the code, go back through all text and narrative sections to reflect results from the code. Any numeric values in the text and resulting commentary must reflect the output of the code chunks.
8. **Preview locally** with `quarto preview` to confirm formatting, then remove `draft: true` when ready to publish. Run `quarto render` to generate final HTML under `_site/`.

## Creating a Tool
1. **Choose a slug** and create a folder under `tools/` (e.g., `tools/my-new-tool/`).
2. **Build the UI** in `app.html`. Keep the file standalone—include all necessary HTML, CSS, and inline JavaScript. Use `tools/inflation-monitor/app.html` as a starting point if desired.
3. **Create `index.qmd`** with minimal front matter and include the HTML:
   ```yaml
   ---
   title: "Tool Name"
   description: "One-line summary"
   page-layout: full
   ---

   {{&lt; include app.html &gt;}}
   ```
   - Add additional narrative sections or usage notes below the include as needed.
4. Use Netlify Functions for any server-side API calls such as downloading data or making the tool dynamic. 
5. **Confirm listing**: The gallery at `tools/index.qmd` automatically discovers `*/index.qmd`, so no manual registration is required. Ensure the title/description fit within the 160-character limit enforced by the listing configuration.

### Tool Quality Checklist
- Ensure `app.html` is **valid fragment HTML** (no `<!DOCTYPE>` or `<html>` wrapper) so Quarto does not escape it as code. If you use newer semantic tags (e.g., `<section>`, `<article>`), keep the structure valid and close every element; when in doubt, wrap the entire shell in a single root `<div>` and dynamically inject inner markup via JavaScript.
- Keep the tool asset self-contained: load fonts, scripts, and styles inside `app.html`; avoid relying on global site CSS.
- When hitting external APIs, create or update a Netlify Function under `netlify/functions/` and confirm it runs with `node netlify/functions/<name>.js` (or via `netlify dev`) before wiring it to the UI.
- Run `quarto render tools/<slug>/index.qmd` after every major change. Fix any Pandoc warnings immediately—treat them as build failures.
- Spot-check the listing card: confirm the tool’s title, description, and optional `image:` front-matter entry render as expected on `tools/index.qmd`.

## Operational Tips
- Keep Markdown lint-friendly (wrap at ~100 characters, use heading hierarchies).
- Run `quarto render` before publishing to catch build failures.
- Update `requirements.txt` if you add new Python dependencies for posts or tools, and verify reproducibility by creating a fresh virtual environment.
- Store sensitive information outside the repository; this site is fully static.
