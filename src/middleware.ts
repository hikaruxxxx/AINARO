import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "./i18n/config";

export default createMiddleware({
  locales,
  defaultLocale,
  localeDetection: true,
  localePrefix: "always",
});

export const config = {
  matcher: ["/((?!admin|api|_next|_vercel|.*\\..*).*)" ],
};
