## ASK
Create a badge representing the following skillset: 

{{SKILL_WITH_METADATA}}

## EXTRA CONTEXT

{{EXTRA_CONTEXT}}

## Reference style
Use the provided badge examples as the style reference (shape, palette logic, stroke weight, icon density, decorative language). Do not copy specific icons.

## Subject
One primary icon representing the skill, with supporting decorative elements.

## Composition
- Centered, symmetrical primary icon
- Include a dotted or dashed border shape (circle, rounded rectangle, or hexagon) framing the main icon
- Add 4–8 small floating accents in the margins (dots, tiny squares, plus signs, small circles, short line segments)
- Do not include an outline around the badge
- Optional: subtle horizontal line patterns in the lower third suggesting data flow or circuitry

## Location/Context
- Inside a rounded-corner hexagon badge.

## Style
Flat vector, clean geometry, consistent stroke weight, no gradients, no harsh shadows, no texture. Decorative elements should be sparse and evenly distributed—not cluttered. 

## Palette
- Cohesive limited palette (2–4 colors see below).
- Central icon in high-contrast light tone. 
- Use one accent color sparingly for floating elements or secondary details.

### Specific Colors of the Palette
#365FAF (primary inner color of the badge)
#6292EF
#4CB4FF
#F4FAFF

## Legibility constraint (critical)
Must be instantly recognizable at 24–32px. Keep decorative accents small and peripheral—they should add visual interest without competing with the primary icon.

## Negative constraints
No text, no letters, no numbers, no logos, no UI/infographic layouts, no multi-object scenes.

## Format
Square 1:1 image on solid greenscreen background (04F404) around the outside of the badge (so the background is easily differentiated from the badge).



__TEMPLATE__
template type: image

Input:
  - EXTRA_CONTEXT

Resources:
  - SKILL_WITH_METADATA

variables:
  - IMAGE_URL

Generate an image:
  type: generateImage
  model: gemini-3-pro-image-preview
  size: 1024x1024
  input:
    - SKILL_WITH_METADATA
    - EXTRA_CONTEXT
  output: IMAGE_URL
  prompt: badge-base-image-prompt