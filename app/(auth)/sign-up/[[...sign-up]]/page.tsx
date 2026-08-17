import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div style={{ display: "grid", minHeight: "100vh", placeItems: "center" }}>
      <SignUp />
    </div>
  );
}
