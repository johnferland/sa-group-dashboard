import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="ds-auth">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
        forceRedirectUrl="/"
      />
    </div>
  );
}
