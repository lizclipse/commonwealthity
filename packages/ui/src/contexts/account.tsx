import { gql, type TypedDocumentNode } from "@apollo/client/core";
import jwtDecode from "jwt-decode";
import {
  type Accessor,
  batch,
  createContext,
  type FlowProps,
  onCleanup,
  useContext,
} from "solid-js";
import type { JSX } from "solid-js/web/types/jsx";
import {
  StorageSerializers,
  useLocalStorage,
  useSessionStorage,
} from "solidjs-use";
import type {
  Account,
  AccountFieldsFragment,
  AuthenticatedAccount,
} from "~gen/graphql";

export const GQL_ACCOUNT: TypedDocumentNode<AccountFieldsFragment, void> = gql`
  fragment AccountFields on AuthenticatedAccount {
    account {
      id
      handle
      revokedAt
    }
    accessToken
    refreshToken
  }
`;

export interface AccountCtx {
  readonly account: Accessor<Account | undefined>;
  readonly refreshToken: Accessor<string | undefined>;
  readonly accessToken: Accessor<string | undefined>;
  readonly logout: () => void;
  readonly login: (account: AuthenticatedAccount) => void;
}

export interface AccessToken {
  exp: number;
  hdl: string;
  iat: number;
  id: string;
  kind: "Access";
  nbf: number;
}

export interface RefreshToken {
  exp: number;
  iat: number;
  id: string;
  kind: "Refresh";
  nbf: number;
}

export function tokenExpiry<T extends AccessToken | RefreshToken>(
  token: string
): number {
  const { exp } = jwtDecode<T>(token);
  return exp * 1000;
}

const AccountContext = createContext<AccountCtx>();

export function useAccount(): AccountCtx {
  // Will always be set by Contexts
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return useContext(AccountContext)!;
}

const tokenCheckInterval = 60_000; // 1 minute
const removeBuffer = 2 * tokenCheckInterval; // 2x check interval

export default function AccountProvider(props: FlowProps): JSX.Element {
  const [account, setAccount] = useLocalStorage<Account | undefined>(
    "account",
    undefined,
    { serializer: StorageSerializers.object }
  );
  const [refreshToken, setRefreshToken] = useLocalStorage<string | undefined>(
    "refreshToken",
    undefined,
    { serializer: StorageSerializers.string }
  );
  const [accessToken, setAccessToken] = useSessionStorage<string | undefined>(
    "accessToken",
    undefined,
    { serializer: StorageSerializers.string }
  );

  // Remove expired tokens
  const removedExpired = () => {
    for (const [token, setToken] of [
      [refreshToken(), setRefreshToken],
      [accessToken(), setAccessToken],
    ] as const) {
      const expiry = token != null ? tokenExpiry(token) : undefined;
      if (expiry == null) {
        continue;
      }

      if (expiry <= Date.now() - removeBuffer) {
        setToken(undefined);
      }
    }
  };
  removedExpired();
  const checkRef = setInterval(removedExpired, tokenCheckInterval);
  onCleanup(() => clearInterval(checkRef));

  const logout = () =>
    batch(() => {
      setAccount(undefined);
      setRefreshToken(undefined);
      setAccessToken(undefined);
    });

  const login = (acc: AuthenticatedAccount) =>
    batch(() => {
      setAccount(acc.account);
      setRefreshToken(acc.refreshToken);
      setAccessToken(acc.accessToken);
    });

  return (
    <AccountContext.Provider
      value={{ account, refreshToken, accessToken, logout, login }}
    >
      {props.children}
    </AccountContext.Provider>
  );
}