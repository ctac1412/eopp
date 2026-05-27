# Captcha Types — Requirements for Expert

## 1. Figure Captchas (Фигуры)

### Visual characteristics
- 9 tiles (160×90 px each), arranged as 3×3 grid variants (15 total)
- Each tile contains ONE geometric shape centered on noisy background
- Shape types: **square (квадрат), circle (круг), triangle (треугольник)**
- Colors: 3 contrasting colors per captcha (typically red, blue, white — vary between captchas)
- Each shape is **solid-filled** with uniform color (not strokes, not outlines)
- Shape has a clear **boundary/contour** against the noisy background
- The background is noisy/grainy with a different color than the shape

### Structural pattern
- Shapes of the **same type** form a **row** in the correct assembly
- Example: row 1 = 3 squares, row 2 = 3 circles, row 3 = 3 triangles
- Within a row, each tile has the same shape type but DIFFERENT color
- The 3 colors are distributed across rows (one per column position)

### Known examples (7 captchas)
```
f737684e17f3cdcc, 587ee3409a2eca4a, ec695d81d76aec41,
ca186a379dbcb6c8, b16fe76a7b2e491f, 786925580affd550,
48fef3307bde851f
```

### Classification method
1. **Dominant color per tile**: median RGB of center 60% region
2. **K-means k=3** on 9 tile colors → checks:
   - min distance between cluster centers > 140
   - cluster sizes 2-4 each (ideally 3×3)
   - separation ratio (min_dist / avg_dist) > 0.55
3. **Border contrast**: center color vs border color difference > 80 on ≥3 tiles
4. Both pass → figure captcha

### Open questions for expert
- Best way to **identify shape type** (square/circle/triangle) on noisy tiles?
- Best way to **identify dominant color** of each shape?
- How to **group tiles by shape** for row formation?
- Are shapes always in the same position within tiles (centered)?
- Can multiple shape types appear on the same tile? (assumed: no)
- Are there captchas with only 2 shape types or 2 colors?

---

## 2. Digit Captchas (Цифры)

### Visual characteristics
- 9 tiles (160×90 px), 15 assembly variants
- Each tile contains ONE digit (1-9) drawn on noisy background
- Digits are **stroke-based** (not filled), drawn with varying line thickness
- Different fonts per captcha (not consistent across captchas)
- Background has random noise
- Digits appear on ALL 9 tiles (one unique digit per tile)

### Structural pattern
- The 9 tiles contain digits **1 through 9** (no repeats)
- The correct assembly likely orders digits by some rule
- Each tile has exactly one digit
- Digits are typically centered

### Known examples (10 captchas)
```
d334e92fdbf86994, e518ac2a4d823dbe, f1a1f7cea6686fb8,
47334b0385f0a06a, fc6ab1a37a790ca3, 666321e86943b462,
3321c54e7a705433, 4262f3a759fb3aac, 74e2b42abb415988,
57efab52cdabb0cb
```

### Classification method
1. **HOG features**: tile resized to 64×36, Histogram of Oriented Gradients (756-dim vector)
2. **Linear SVM**: trained on 90 positive + 1332 negative tiles
3. **Captcha-level**: if ≥5 of 9 tiles classified as "digit" → digit captcha
4. Model artifact: `data/tile_classifier.pkl` (StandardScaler + LinearSVC, 52 KB)

### Open questions for expert
- How to **recognize which digit** is on each tile? (EasyOCR works for 9/10 captchas, fails on e518ac)
- Best approach for **e518ac** where OCR fails — different digit font/style
- What is the correct **ordering rule** for digits 1-9?
- Are digits always oriented upright? (assumed: yes)
- Can background noise obscure parts of digits?

---

## 3. Puzzle Captchas (Пазлы) — default

### Visual characteristics
- 9 tiles forming a 3×3 puzzle of a larger image
- Content is natural image fragments (photos, scenes, objects)
- Tiles must be assembled to form a coherent picture

### Solver
- **SeamMetricsSolver**: computes discontinuity, SSIM, coherence, Sobel continuity
- Evaluates all 15 variant assemblies, picks best-scoring one

---

## 4. Classification Pipeline (production)

```
Captcha → ChainClassifier:
  1. FigureCaptchaClassifier  (k-means + border contrast, ~0.001s)
  2. DigitCaptchaClassifier   (HOG+SVM, ~0.007s)
  3. Default → Puzzle         (fallback)
     ↓
Solver selected by classification:
  figures → FigureCaptchaSolver (stub, delegates to SeamMetrics)
  digit   → DigitCaptchaSolver  (stub, delegates to SeamMetrics)
  default → SeamMetricsSolver
```

### Data volumes
- 7 figure captchas (63 tiles) — labeled in DB
- 10 digit captchas (90 tiles) — labeled in DB
- 141 puzzle captchas (1269 tiles) — remaining
- Total: 158 captchas indexed, 1422 tiles

### Performance
- Classification: 0.030s total (all 3 classifiers)
- Digit classifier: 0.007s (HOG+SVM on 9 tiles)
- Figure classifier: ~0.001s (k-means on 9 points)
