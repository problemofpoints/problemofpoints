# Agent Runbook

## Project Overview
- This repository contains the Quarto source for [problemofpoints.com](https://www.problemofpoints.com), a static site generated from `.qmd` sources and lightweight HTML tools.
- Content lives in two main areas: long-form posts under `posts/` and interactive utilities under `tools/`.
- Rendering relies on the Quarto CLI plus Python 3.12 and the packages pinned in `requirements.txt`.

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
   date: "2024-07-04"
   categories: [analysis, insurance]
   subtitle: "Optional subtitle"
   draft: true
   ---
   ```
   - `draft: true` keeps the post out of production until removed.
3. **Write content** below the front matter using standard Quarto Markdown. By default posts inherit options from `posts/_metadata.yml` (`freeze: true`, no table of contents, etc.).
4. **Embed computations** by adding Python/R code chunks. Quarto will respect the global `freeze` setting; to force re-execution set `freeze: false` in the front matter or `execute: { eval: true }`.
5. **Reference static assets** by placing images or data within the post folder and linking relatively (`![Alt text](figure.png)`).
6. **Preview locally** with `quarto preview` to confirm formatting, then remove `draft: true` when ready to publish. Run `quarto render` to generate final HTML under `_site/`.

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
   
   {{</* include app.html */>}}
   ```
   - Add additional narrative sections or usage notes below the include as needed.
4. **Test locally**: `quarto preview tools/index.qmd` ensures the tool loads and works in the generated site.
5. **Confirm listing**: The gallery at `tools/index.qmd` automatically discovers `*/index.qmd`, so no manual registration is required. Ensure the title/description fit within the 160-character limit enforced by the listing configuration.

## Operational Tips
- Keep Markdown lint-friendly (wrap at ~100 characters, use heading hierarchies).
- Run `quarto render` before publishing to catch build failures.
- Update `requirements.txt` if you add new Python dependencies for posts or tools, and verify reproducibility by creating a fresh virtual environment.
- Store sensitive information outside the repository; this site is fully static.

### Netlify Functions & API Keys
- The inflation monitor calls `/.netlify/functions/bls-proxy`, which forwards requests to the BLS API with the server-side `BLS_API_KEY`.
- **Local development:**  
  1. Install the Netlify CLI (`npm install -g netlify-cli`).  
  2. Create a `.env` file with `BLS_API_KEY=<your key>` (the CLI loads it automatically).  
  3. Run `netlify dev` to serve the Quarto preview and functions together (preview on `http://localhost:8889`, Quarto on 8888).
- **Deployment:** Set `BLS_API_KEY` as an environment variable in the Netlify site settings (Site settings → Build & deploy → Environment). Netlify injects it into the function at build and runtime.
