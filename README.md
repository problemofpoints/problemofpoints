# problemofpoints

Repository for website at [https://www.problemofpoints.com](https://www.problemofpoints.com)

Capital allocation in an uncertain world.

## Local development

This site is built with [Quarto](https://quarto.org/) and now leans on Python for certain pages (e.g., the Tools gallery). The recommended workflow is:

```bash
python3.12 -m venv .venv  # or pyenv local 3.12.x && python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
quarto render
```

- Install the Quarto CLI separately if it is not already available on your machine.
- The project currently targets Python 3.12 for rendering. If you use `pyenv`, run `pyenv install 3.12.x` (once) and `pyenv local 3.12.x` in this repository before creating the virtual environment.
- The `requirements.txt` file captures the Python dependencies used when rendering posts and tools. Add or pin packages there as new functionality is introduced.

When finished working, deactivate the environment with `deactivate`.

### Working with serverless functions

The inflation monitor relies on a Netlify function so the BLS API key stays on the server.

```bash
npm install -g netlify-cli     # once
echo "BLS_API_KEY=your-key" > .env
netlify dev                    # runs Quarto preview + functions
```

The Netlify CLI loads `.env` automatically and proxies requests to `/.netlify/functions/*`. The preview site is served at `http://localhost:8889` (the Quarto preview itself runs on port `8888`). In production, define the `BLS_API_KEY` variable in your Netlify site settings so deployed functions can authenticate with the BLS API.

## Adding tools

Each tool lives in its own folder under `tools/`. To add a new entry:

1. Create `tools/<slug>/app.html` containing the standalone HTML for your utility (use `tools/sample-tool/app.html` as a template).
2. Create `tools/<slug>/index.qmd` with Quarto front matter (title/description) and embed the HTML using `{{< include app.html >}}`.
3. Commit both files. The Tools index (`tools/index.qmd`) automatically lists every `tools/*/index.qmd`, so no additional registry updates are required.
