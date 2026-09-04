import { requireSuperAdmin } from "@/lib/auth";
import { listBrandsWithCredentials } from "@/lib/brands";
import { listManagedUsers } from "@/lib/users";
import { BrandFormFields } from "@/components/brand-form-fields";
import { Alert, Button, Field, Input, Page, PageHeader, Panel, Section, Select, Table, TextMuted } from "@/components/ui";
import { createBrandAction, syncBrandNowAction, updateBrandAction, rotateWebLeadsWebhookAction } from "./brands/actions";
import { addPersonAction, assignPersonAction } from "./people-actions";

export const maxDuration = 300;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireSuperAdmin();
  const { saved, error } = await searchParams;
  const [brands, people] = await Promise.all([listBrandsWithCredentials(), listManagedUsers()]);

  return (
    <Page>
      <PageHeader
        title="Admin"
        description="Manage companies, property IDs, and who can see each lab."
        actions={
          <div className="ds-row">
            <Button href="/api/admin/google-oauth/start">Connect Google</Button>
            <Button href="/api/admin/sync-google" variant="secondary">
              Sync all companies
            </Button>
          </div>
        }
      />

      {saved ? <Alert tone="ok">{saved}</Alert> : null}
      {error ? <Alert tone="err">{error}</Alert> : null}

      <Section title="People">
        <TextMuted>
          Add an email, then assign it to Exec (all brands, read-only) or Lab Manager (one company).
          They sign in with Clerk using that email; until then the row stays unlinked.
        </TextMuted>

        <Panel>
          <h3 className="ds-heading-sm">Add person</h3>
          <form action={addPersonAction} className="ds-row">
            <Field label="Email">
              <Input type="email" name="email" required placeholder="name@lab.com" />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue="lab_manager">
                <option value="lab_manager">Lab manager</option>
                <option value="exec">Exec</option>
                <option value="super_admin">Super admin</option>
              </Select>
            </Field>
            <Field label="Company">
              <Select name="brand_id" defaultValue="">
                <option value="">None (exec / super admin)</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button>Add / update by email</Button>
          </form>
        </Panel>

        <Table headers={["Email", "Signed in", "Assign"]}>
          {people.map((person) => (
            <tr key={person.id}>
              <td>
                {person.email}
                <div className="ds-muted">{person.brand_name ?? "All brands"}</div>
              </td>
              <td>{person.clerk_user_id && !person.clerk_user_id.startsWith("pending:") ? "Yes" : "Invited"}</td>
              <td>
                <form action={assignPersonAction} className="ds-row">
                  <input type="hidden" name="user_id" value={person.id} />
                  <Select name="role" defaultValue={person.role}>
                    <option value="lab_manager">Lab manager</option>
                    <option value="exec">Exec</option>
                    <option value="super_admin">Super admin</option>
                  </Select>
                  <Select name="brand_id" defaultValue={person.brand_id ?? ""}>
                    <option value="">None</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </Select>
                  <Button>Save</Button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Companies & property IDs">
        <TextMuted>
          Add a company or paste GA4 / GSC / Ads IDs. Sync now pulls the last 14 days of GA4,
          Search Console, Google Ads, and Meta Ads for that company.
        </TextMuted>

        <Panel>
          <h3 className="ds-heading-sm">Add a company</h3>
          <form action={createBrandAction} className="ds-stack">
            <BrandFormFields />
            <p>
              <Button>Add company</Button>
            </p>
          </form>
        </Panel>

        {brands.map((brand) => (
          <Panel key={brand.id}>
            <h3 className="ds-heading-sm">{brand.name}</h3>
            <form action={updateBrandAction} className="ds-stack">
              <input type="hidden" name="brand_id" value={brand.id} />
              <BrandFormFields brand={brand} />
            <div className="ds-row">
              <Button>Save {brand.name}</Button>
            </div>
            </form>
            <form action={syncBrandNowAction} className="ds-row">
              <input type="hidden" name="brand_id" value={brand.id} />
              <Button variant="secondary">Sync now</Button>
            </form>
            <div className="ds-stack" style={{ marginTop: "var(--space-4)" }}>
              <h3 className="ds-heading-sm">Web leads webhook</h3>
              <TextMuted>
                Point the website form (or Zapier) here. POST JSON or form fields: first_name, last_name,
                email, date, count. Header <code>X-Webhook-Secret</code>.
              </TextMuted>
              <Field label="Webhook URL">
                <Input
                  readOnly
                  defaultValue={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/web-leads/${brand.slug}`}
                />
              </Field>
              <Field label="Secret">
                <Input
                  readOnly
                  defaultValue={brand.web_leads_webhook_secret ?? "Save the company once to generate a secret"}
                />
              </Field>
              <form action={rotateWebLeadsWebhookAction}>
                <input type="hidden" name="brand_id" value={brand.id} />
                <Button variant="secondary">Generate / rotate secret</Button>
              </form>
            </div>
          </Panel>
        ))}
      </Section>
    </Page>
  );
}
