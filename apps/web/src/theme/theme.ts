"use client";

import { createTheme } from "@mui/material/styles";

import { components } from "./components";
import { palette } from "./palette";
import { typography } from "./typography";

const theme = createTheme({
  cssVariables: true,
  shape: {
    borderRadius: 8,
  },
  palette,
  typography,
  components,
});

export default theme;
