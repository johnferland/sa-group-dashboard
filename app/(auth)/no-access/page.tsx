import { Page, PageHeader, TextMuted } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out-button";

export default function NoAccessPage() {
  return (
    <Page>
      <PageHeader
        title="No dashboard access"
        description="This Clerk account is signed in, but that email is not on the dashboard yet."
      />
      <div className="ds-stack">
        <TextMuted>
          Ask a Super Admin to add the exact email you used to sign in, then sign out and try again.
        </TextMuted>
        <SignOutButton />
      </div>
    </Page>
  );
}
