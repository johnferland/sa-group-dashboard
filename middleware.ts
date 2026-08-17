import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)",
  "/api/cron(.*)",
]);

function hasValidCronSecret(request: Request): boolean {
  const auth = request.headers.get("authorization") ?? "";
  return Boolean(process.env.CRON_SECRET) && auth === `Bearer ${process.env.CRON_SECRET}`;
}

export default clerkMiddleware(async (authFn, req) => {
  if (req.nextUrl.pathname.startsWith("/api/cron")) {
    if (!hasValidCronSecret(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return;
  }
  if (!isPublicRoute(req)) {
    await authFn.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js|json|png|svg|jpg|ico)).*)", "/(api|trpc)(.*)"],
};
