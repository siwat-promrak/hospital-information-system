import type { ThemeOptions } from "@mui/material/styles";

// System-font stack fallback. If a web font is introduced later (e.g. via next/font),
// prepend its family in the layout where it's loaded.
export const typography: ThemeOptions["typography"] = {
  fontFamily: [
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    '"Segoe UI"',
    "Roboto",
    '"Helvetica Neue"',
    "Arial",
    "sans-serif",
  ].join(","),
};
