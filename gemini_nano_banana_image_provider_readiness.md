# Gemini Nano Banana Image Provider Readiness

**Status:** The server-side `GEMINI_API_KEY` authenticated successfully against the Gemini models endpoint on September 5, 2026. The key is never stored in this file, source code, client bundles, notes, logs, or database records.

## Validated connection status in CabinetDealz

The provided Gemini key has been validated for server-side account and model access. Customer image creation remains on CabinetDealz’s approved internal image-service path until Gemini Nano Banana is available through that controlled provider contract. Gemini is not a geometry engine, price engine, cabinet configurator, or substitute for the deterministic saved 2D/3D plan. The deterministic saved plan remains authoritative for cabinets, openings, appliances, fixtures, materials, camera, and price.

Every future provider request must remain tied to the saved-plan identifier, saved revision, server-derived plan fingerprint, deterministic JPEG capture, selected door style, countertop, flooring, backsplash, faucet, and sink. Existing server-side phone verification and qualified-lead CRM safeguards remain required before an image can be generated.

## Provider contract

Google documents Gemini image models under the Nano Banana name. The general-purpose `gemini-3.1-flash-image` model supports reference-image workflows and 16:9 output at up to 4K. The customer workflow should request a 16:9 2K image and use the immutable Designer JPEG as the primary reference. Material references may improve only the already-selected matching surface; they may not introduce or replace a cabinet, fixture, appliance, or room element.

The API response returns image data that must be processed only on the server, stored using the existing storage helper, and referenced by URL in the existing qualified image-request record. Gemini-generated images carry a SynthID watermark and must be presented as an illustrative render, not as an authoritative plan or guaranteed production drawing.

## Administrator-only illustrative test

CabinetDealz provides a separate administrator-only Google/Gemini image test for a saved, locked Designer plan. It validates the selected 1920×1080-or-larger JPEG, current saved-plan revision, server-derived fingerprint, camera, and selected materials before sending the reference image to Gemini. The server accepts both the SDK convenience image field and the official Interactions REST nested model-output form, then stores only the verified image bytes with the current saved-plan identifier, revision, and fingerprint. The administrator comparison requests a bounded 1K, 16:9 result with a 90-second server-side timeout; it returns safe retry guidance for timeouts, rate limits, unavailable service, and access configuration without returning a provider payload or credential. An administrator can reopen that stored result after changing pages, but only while the saved plan remains the same revision. The output is an illustrative comparison and is never used to alter the saved plan, price, customer phone-verification requirement, or CRM workflow. Customer rendering remains on the approved controlled path until separately approved for release.

## Official interaction lifecycle reference

Google’s Gemini Interactions API supports `background: true` for asynchronous interactions and retrieval through `GET /v1beta/interactions/{id}`. Image output may be returned through the SDK convenience image field or a `model_output` step’s image content. The administrator image test uses only the server-side API path and returns sanitized status, never a raw provider response or credential. Source: [Google Gemini Interactions API](https://ai.google.dev/api/interactions-api).

## Security and operations

The API key must be read server-side from `GEMINI_API_KEY`. It must never be sent to the browser or committed to source control. An administrator-only connection check may validate provider access but must return only configured/connected/failed status and a safe error message. The Operations panel may describe the provider, its status, required setup, and testing steps without exposing credentials.

## Official sources

1. [Google AI for Developers — Gemini API image generation](https://ai.google.dev/gemini-api/docs/image-generation)
2. [Google AI for Developers — Using Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key)
3. [Google AI for Developers — Gemini Interactions API](https://ai.google.dev/api/interactions-api)
