"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { AuthDialog } from "./AuthDialog";
import { Home, type AccountInfo } from "./Home";
import { Onboarding } from "./Onboarding";
import { useCycleData } from "./useCycleData";

export function App() {
  const { state, save, resetGuest, signedIn, signOut, removeAccount, retrySync, authNotice, dismissAuthNotice } =
    useCycleData();
  const [authOpen, setAuthOpen] = useState(false);
  const authAvailable = getSupabase() !== null;

  if (state.status === "loading" || (state.status === "account" && !state.data)) {
    return <main className="flex-1" aria-busy />;
  }

  if (state.status === "error") {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-3 px-4">
        <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
        <p className="text-muted">{state.message}</p>
      </main>
    );
  }

  const account: AccountInfo | null =
    state.status === "account"
      ? {
          email: state.email,
          sync: state.sync,
          onSignOut: signOut,
          onDelete: removeAccount,
          onRetry: () => void retrySync(),
        }
      : null;
  const openAuth = authAvailable ? () => setAuthOpen(true) : null;

  return (
    <>
      {authNotice && (
        <div role="alert" className="mx-auto mt-4 w-full max-w-md px-4">
          <div className="flex items-start gap-3 rounded-2xl bg-warning-soft p-4 text-sm text-warning">
            <p className="flex-1">{authNotice}</p>
            <button type="button" aria-label="Закрыть" className="-m-1 p-1" onClick={dismissAuthNotice}>
              ✕
            </button>
          </div>
        </div>
      )}
      {state.data ? (
        <Home
          data={state.data}
          today={state.today}
          onChange={save}
          onReset={resetGuest}
          account={account}
          onSignIn={openAuth}
        />
      ) : (
        <Onboarding today={state.today} onDone={save} onSignIn={openAuth} />
      )}
      {authOpen && (
        <AuthDialog
          onClose={() => setAuthOpen(false)}
          onSignedIn={(user) => {
            setAuthOpen(false);
            signedIn(user);
          }}
        />
      )}
    </>
  );
}
