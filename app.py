"""Manipulation Detector — Flask backend.

Analyzes uploaded text or screenshots with Claude and reports whether the
content shows signs of manipulation, along with the specific techniques found.
"""

import base64
import json
import os

import anthropic
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Claude resolves credentials from the environment automatically:
# ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile.
client = anthropic.Anthropic()

MODEL = "claude-opus-4-8"

# Supported image types for screenshot uploads.
ALLOWED_IMAGE_TYPES = {
    "image/png": "image/png",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/webp": "image/webp",
    "image/gif": "image/gif",
}

SYSTEM_PROMPT = """You are an expert in psychology, rhetoric, and social \
engineering. You analyze text and screenshots (messages, ads, emails, social \
posts, chats) to determine whether they contain manipulation.

Manipulation is any attempt to influence someone's beliefs, emotions, or \
behavior through deceptive, coercive, or unfair means rather than honest \
persuasion. Consider techniques such as:
- Emotional manipulation: guilt-tripping, fear-mongering, love-bombing, \
  playing the victim
- Gaslighting: denying reality, making someone doubt their memory or perception
- Coercion & pressure: ultimatums, false urgency, artificial scarcity
- Deception: lying, half-truths, misleading framing, cherry-picking
- Social engineering / phishing: impersonation, pretexting, credential requests
- Dark patterns: manipulative UI, hidden costs, forced continuity
- Propaganda & rhetoric: loaded language, ad hominem, false dilemmas, \
  bandwagon, appeal to authority

Be fair and precise. Ordinary honest persuasion, clear opinions, and normal \
marketing are NOT manipulation on their own. Only flag genuine manipulative \
intent or technique. When uncertain, say so and lower your confidence.

Base your judgment strictly on the content provided."""

# Structured output schema so the frontend always receives clean, typed JSON.
ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "is_manipulation": {
            "type": "boolean",
            "description": "True if the content shows manipulation.",
        },
        "confidence": {
            "type": "string",
            "enum": ["low", "medium", "high"],
            "description": "How confident the judgment is.",
        },
        "summary": {
            "type": "string",
            "description": "One or two sentence plain-language verdict.",
        },
        "techniques": {
            "type": "array",
            "description": "Manipulation techniques found (empty if none).",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "evidence": {
                        "type": "string",
                        "description": "The specific phrase or element that shows it.",
                    },
                    "explanation": {
                        "type": "string",
                        "description": "Why this is manipulative.",
                    },
                },
                "required": ["name", "evidence", "explanation"],
                "additionalProperties": False,
            },
        },
        "recommendation": {
            "type": "string",
            "description": "What the reader should keep in mind or do.",
        },
    },
    "required": [
        "is_manipulation",
        "confidence",
        "summary",
        "techniques",
        "recommendation",
    ],
    "additionalProperties": False,
}


def analyze_content(user_blocks):
    """Send content blocks to Claude and return the parsed analysis dict."""
    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        thinking={"type": "adaptive"},
        output_config={"format": {"type": "json_schema", "schema": ANALYSIS_SCHEMA}},
        messages=[{"role": "user", "content": user_blocks}],
    )

    if response.stop_reason == "refusal":
        raise RuntimeError("The request was declined by the safety system.")

    # With structured output, the JSON lives in the first text block.
    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        raise RuntimeError("No analysis was returned.")
    return json.loads(text)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    text = (request.form.get("text") or "").strip()
    image = request.files.get("image")

    if not text and (image is None or image.filename == ""):
        return jsonify({"error": "Please provide text or an image to analyze."}), 400

    blocks = []

    if image is not None and image.filename != "":
        media_type = ALLOWED_IMAGE_TYPES.get((image.mimetype or "").lower())
        if media_type is None:
            return jsonify({"error": "Unsupported image type. Use PNG, JPEG, WEBP, or GIF."}), 400
        data = base64.standard_b64encode(image.read()).decode("utf-8")
        blocks.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": data},
            }
        )

    instruction = (
        "Analyze the following content for manipulation."
        if not text
        else "Analyze the following content for manipulation:\n\n" + text
    )
    blocks.append({"type": "text", "text": instruction})

    try:
        result = analyze_content(blocks)
    except anthropic.APIError as exc:
        app.logger.exception("Claude API error")
        return jsonify({"error": f"Analysis service error: {exc}"}), 502
    except (RuntimeError, ValueError) as exc:
        app.logger.exception("Analysis failed")
        return jsonify({"error": str(exc)}), 502
    except Exception:  # noqa: BLE001 — surface any unexpected failure cleanly
        app.logger.exception("Unexpected error during analysis")
        return (
            jsonify(
                {
                    "error": "The analysis service is not configured correctly. "
                    "Make sure Claude credentials (ANTHROPIC_API_KEY) are set."
                }
            ),
            502,
        )

    return jsonify(result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
