# Photo to Cart Verification

The supplied handwritten order photo was run through the live vision extraction route. The scan recognized and matched all four readable lines from the active catalog: `B-12 × 3`, `B24 × 4`, `SB36 × 2`, and `W2142 × 1`. The active master catalog displays those normalized matches as `B12`, `B24`, `SB-36`, and `W-21-42`, respectively, for a total of **10 units**.

The mobile workflow now offers **Take photo / Scan now** through a camera-capture input and **Choose saved photo** as a separate action. Large phone-camera images are resized locally before OCR, and the same photo can be selected again after a retake. The cart-item builder was covered by a focused test that confirms every matched row carries the selected door style and its extracted quantity before `addItem` is called.
