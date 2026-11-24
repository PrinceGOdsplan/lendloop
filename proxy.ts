import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything except the public landing page requires a Clerk session.
// (Convex re-checks identity on every call; this only keeps signed-out
// visitors out of the app pages.)
const isProtectedRoute = createRouteMatcher([
  "/tools(.*)",
  "/my-listings(.*)",
  "/my-requests(.*)",
  "/incoming(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
