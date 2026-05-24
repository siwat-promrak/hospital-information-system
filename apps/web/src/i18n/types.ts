import type messages from "../messages/en.json";
import type { routing } from "./routing";

declare module "use-intl/core" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}

export {};
