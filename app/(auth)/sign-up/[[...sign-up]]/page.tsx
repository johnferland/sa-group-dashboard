import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="ds-auth">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/"
        forceRedirectUrl="/"
      />
    </div>
  );
}
