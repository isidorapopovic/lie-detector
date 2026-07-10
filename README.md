# Manipulation Detector

A small web app that uses an LLM (Claude) to judge whether an uploaded **text**
or **screenshot** is a form of manipulation — and explain *why*. This is an MVP
built around a couple of examples, designed to scale up later.

## What it does

- Paste text (a message, email, ad, chat) **and/or** upload a screenshot.
- Claude analyzes it and returns a structured verdict:
  - whether it's manipulation, with a confidence level,
  - a plain-language summary,
  - the specific manipulation techniques found, with the evidence and why,
  - a recommendation for the reader.

## Tech

- **Backend:** Python + Flask (`app.py`)
- **LLM:** Claude (`claude-opus-4-8`) with adaptive thinking and structured
  outputs, plus vision for screenshots.
- **Frontend:** plain HTML/CSS/JS (`templates/`, `static/`).

## Run it

```bash
pip install -r requirements.txt

# Provide Claude credentials (either works):
export ANTHROPIC_API_KEY="sk-ant-..."
# or run `ant auth login` once and skip the env var.

python app.py
```

Then open http://localhost:5000.

## Project layout

```
app.py                 # Flask server + Claude call
templates/index.html   # page
static/style.css       # styling (uses the project color palette)
static/script.js       # upload + fetch logic
requirements.txt
```

## Color palette

| Hex     | Name           | Used for                        |
| ------- | -------------- | ------------------------------- |
| D7D9B1  | Vanilla Custard| background / recommendation box |
| 84ACCE  | Sky Reflection | "no manipulation" verdict       |
| 827191  | Dusty Lavender | labels / muted accents          |
| 7D1D3F  | Dark Amaranth  | "manipulation detected" / brand |

## Scaling up later

Natural next steps: batch/history storage, per-technique highlighting on the
screenshot, user accounts, an API endpoint for programmatic use, and streaming
results for longer inputs.
