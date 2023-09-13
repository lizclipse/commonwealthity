import { type TypedDocumentNode } from "@apollo/client/core";
import { createMutation, gql } from "@merged/solid-apollo";
import { createRouteAction, redirect } from "solid-start";
import DisplayError from "~/components/DisplayError";
import { GQL_ACCOUNT, useAccount } from "~/contexts";
import styles from "~/form.module.scss";
import { Trans } from "~/i18n";
import type {
  CreateAccountMutation,
  CreateAccountMutationVariables,
} from "~gen/graphql";

const GQL: TypedDocumentNode<
  CreateAccountMutation,
  CreateAccountMutationVariables
> = gql`
  mutation CreateAccount($account: CreateAccount!) {
    createAccount(create: $account) {
      ...AccountFields
    }
  }
  ${GQL_ACCOUNT}
`;

const inputs = {
  userId: "userId",
  pword: "password",
} as const;
export default function Register() {
  const { login } = useAccount();
  const [createAccount] = createMutation(GQL);

  const [create, { Form }] = createRouteAction(async (form: FormData) => {
    const account = {
      userId: form.get(inputs.userId) as string,
      pword: form.get(inputs.pword) as string,
    };

    const result = await createAccount({ variables: { account } });
    login(result.createAccount);
    return redirect("/");
  });

  return (
    <section class={styles.form}>
      <h1>
        <Trans>{(t) => t.core.account.createTitle()}</Trans>
      </h1>
      <Form>
        <label for={inputs.userId}>
          <Trans>{(t) => t.core.account.userId()}</Trans>
        </label>
        <input
          id={inputs.userId}
          name={inputs.userId}
          autoCapitalize="off"
          spellcheck={false}
          autocorrect="off"
          required
        />

        <label for={inputs.pword}>
          <Trans>{(t) => t.core.account.password()}</Trans>
        </label>
        <input
          id={inputs.pword}
          name={inputs.pword}
          type="password"
          required
          minlength={8}
        />

        <button type="submit" disabled={create.pending}>
          <Trans>{(t) => t.core.account.createSubmit()}</Trans>
        </button>

        <DisplayError error={() => create.error as unknown} keepSpacing />
      </Form>
    </section>
  );
}
