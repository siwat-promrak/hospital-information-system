import type { ThemeOptions } from "@mui/material/styles";

export const muiButton: NonNullable<ThemeOptions["components"]>["MuiButton"] = {
  defaultProps: {
    disableElevation: true,
  },
  styleOverrides: {
    root: {
      textTransform: "none",
      fontWeight: 500,
      borderRadius: 8,
    },
  },
};
