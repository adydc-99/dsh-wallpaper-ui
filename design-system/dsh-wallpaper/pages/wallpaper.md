# Wallpaper Settings Page Override

This page is embedded inside the DeepSeek Harness settings shell. The Harness visual system overrides the generic master recommendation.

## Product Fit
- Use the existing DSH settings-page density, typography, spacing, radius, focus ring, and semantic `--dsw-*` tokens.
- Do not load external fonts, introduce a second component library, use emoji icons, or recreate settings chrome.
- Register one additive `settings.section` entry labelled `壁纸`.

## Layout
- Header row: short description, upload button, and secondary “添加 URL” button.
- Responsive library grid: one column below 560 px, two columns from 560 px, three columns when the settings content width permits.
- Each card reserves a 16:9 preview area to avoid layout shift and shows name, source/media labels, selected state text, enable action, and manual delete action.
- Presentation controls form a labelled two-column grid on wide screens and one column on narrow screens.

## Interaction and Accessibility
- Every icon-only action has an accessible name; destructive actions require an explicit confirmation.
- Controls use visible labels and inline validation/error text; remote URL creation displays the privacy warning before submission.
- Keyboard order follows visual order. All custom click targets are native buttons or inputs and retain visible focus.
- Minimum interactive target is 44 × 44 px where the existing DSH shell permits it.
- Media previews use useful alt text; selected state is exposed with text/ARIA and not color alone.
- Honor `prefers-reduced-motion`: do not autoplay animated/video wallpaper and show the static fallback surface.

## Motion and Feedback
- Use only DSH's 150–300 ms motion tokens for hover/focus/state changes.
- Upload/add/delete/apply actions expose pending state and localized success/failure feedback.
- Media decode/playback failure is non-blocking, restores the default background, and leaves the settings/chat surfaces interactive.

## Verification Widths
- 375 px, 768 px, 1024 px, and 1440 px viewport widths.
