import type { ThemeOptions } from "@mui/material/styles";

import { muiAppBar } from "./MuiAppBar";
import { muiButton } from "./MuiButton";
import { muiPaper } from "./MuiPaper";

// Aggregates per-component MUI overrides. To add a new component override:
// 1. Create `./Mui<Name>.ts` exporting a typed `mui<Name>` constant.
// 2. Import it here and add it to the object below under its MUI key.
export const components: ThemeOptions["components"] = {
  MuiButton: muiButton,
  MuiPaper: muiPaper,
  MuiAppBar: muiAppBar,
};
