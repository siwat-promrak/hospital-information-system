"use client";

import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { Link } from "@/i18n/navigation";

interface DepartmentCardLinkProps {
  name: string;
  description: string | null;
  href: string;
}

/**
 * Single department card with click → navigate. Lives in a client
 * component because MUI's `CardActionArea` needs `component={Link}` and
 * passing a React component as a prop into a client component is only
 * legal from within another client component (RSC serialisation).
 */
export default function DepartmentCardLink({
  name,
  description,
  href,
}: DepartmentCardLinkProps) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardActionArea
        component={Link}
        href={href}
        sx={{ height: "100%", alignItems: "stretch" }}
      >
        <CardContent>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              aria-hidden
            >
              <LocalHospitalIcon fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={600} noWrap>
                {name}
              </Typography>
              {description ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {description}
                </Typography>
              ) : null}
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
