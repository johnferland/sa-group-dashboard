import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div style={{ display: "grid", minHeight: "100vh", placeItems: "center" }}>
      <SignIn />
    </div>
  );
}
