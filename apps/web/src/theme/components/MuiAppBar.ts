import type { ThemeOptions } from "@mui/material/styles";

export const muiAppBar: NonNullable<ThemeOptions["components"]>["MuiAppBar"] = {
  defaultProps: {
    elevation: 0,
    color: "primary",
  },
  styleOverrides: {
    root: ({ theme }) => ({
      borderBottom: `1px solid ${theme.palette.divider}`,
    }),
  },
};
