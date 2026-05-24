import type { PaletteOptions } from "@mui/material/styles";

// HIS palette. Light-mode only. Accessibility-conscious, tuned for a clinical setting.
// To consume these values outside MUI (e.g. plain CSS / SCSS), use the auto-generated
// CSS variables produced by `cssVariables: true` on the theme — e.g.
// `var(--mui-palette-primary-main)`, `var(--mui-palette-background-default)`.
export const palette: PaletteOptions = {
  mode: "light",
  primary: {
    light: "#3A3AB3",
    main: "#00008B",
    dark: "#000066",
    contrastText: "#FFFFFF",
  },
  secondary: {
    light: "#FFFFFF",
    main: "#FFFFFF",
    dark: "#F5F5F5",
    contrastText: "#00008B",
  },
  error: {
    main: "#D32F2F",
    contrastText: "#FFFFFF",
  },
  warning: {
    main: "#ED6C02",
    contrastText: "#FFFFFF",
  },
  info: {
    main: "#0288D1",
    contrastText: "#FFFFFF",
  },
  success: {
    main: "#2E7D32",
    contrastText: "#FFFFFF",
  },
  text: {
    primary: "rgba(17, 24, 39, 0.95)",
    secondary: "rgba(17, 24, 39, 0.65)",
    disabled: "rgba(17, 24, 39, 0.40)",
  },
  background: {
    default: "#FAFAFB",
    paper: "#FFFFFF",
  },
  divider: "rgba(0, 0, 0, 0.08)",
};
