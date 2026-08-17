import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";

// Role-based landing: exec/super_admin -> rollup, lab_manager -> straight to their brand.
// The rollup UI itself is Phase 3 — this just gets the routing decision right early.
export default async function DashboardHome() {
  const user = await getCurrentAppUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (user.role === "lab_manager" && user.brand_id) {
    redirect(`/brand/${user.brand_id}`);
  }

  // TODO(Phase 3): render the four-brand rollup + gold/silver/bronze leaderboard here for
  // super_admin and exec.
  return (
    <main style={{ padding: "2rem" }}>
      <h1>SA Group — Executive Rollup</h1>
      <p>Signed in as {user.email} ({user.role}). Rollup UI not built yet.</p>
    </main>
  );
}
