import type { ThemeOptions } from "@mui/material/styles";

export const muiPaper: NonNullable<ThemeOptions["components"]>["MuiPaper"] = {
  defaultProps: {
    elevation: 0,
  },
  styleOverrides: {
    root: {
      backgroundImage: "none",
    },
  },
};
