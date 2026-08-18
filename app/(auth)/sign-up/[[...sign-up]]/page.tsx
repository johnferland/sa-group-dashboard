import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="ds-auth">
      <SignUp />
    </div>
  );
}
