# GLM-5.3-Flash vs DeepSeek V4 Flash — corrected scoreboard

Corrected comparison graphic for official pay-as-you-go token prices.

## Corrections vs. the original graphic

| Field | Original (wrong) | Corrected |
| --- | --- | --- |
| GLM AA Index label | 57 (vendor-reported) | 57 (independent) |
| DeepSeek AA Index | 50 (independent) | **52** (independent) |
| GLM list price | ~$0.14 / $0.44 | **$0.15 / $0.50** |
| GLM promo price | ~$0.07 / $0.22 | **$0.075 / $0.25** (until 09.09.2026 UTC+8) |
| GLM cache-hit | omitted | **$0.03** list / **$0.015** promo |
| DeepSeek price | $0.14 / $0.28 | **off-peak** $0.22 miss / $0.66 out / **$0.007** cache-hit |
| Time-of-day | omitted | GLM flat 24/7 PAYG; DeepSeek off-peak = 50% of peak |

DeepSeek figures on this board use **off-peak only**, as requested.

## Files

- `glm-vs-deepseek-scoreboard.html` — source layout
- `out/glm-vs-deepseek-scoreboard.png` — rendered image

## Regenerate PNG

```bash
python3 render_scoreboard.py
```

HTML source (`glm-vs-deepseek-scoreboard.html`) is kept for layout reference; the PNG is rendered with Pillow so it does not depend on a hung Chrome headless session.
