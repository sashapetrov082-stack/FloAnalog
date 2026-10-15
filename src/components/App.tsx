"use client";

import { useEffect, useState } from "react";
import { registerServiceWorker } from "@/lib/pwa";
import { getSupabase } from "@/lib/supabase/client";
import { AuthDialog } from "./AuthDialog";
import { Home, type AccountInfo } from "./Home";
import { Onboarding } from "./Onboarding";
import { LockScreen, PinSetupDialog } from "./Pin";
import { useAppLock } from "./useAppLock";
import { useCycleData } from "./useCycleData";

export function App() {
  const { state, save, resetGuest, signedIn, signOut, removeAccount, retrySync, authNotice, dismissAuthNotice } =
    useCycleData();
  const lock = useAppLock();
  const [authOpen, setAuthOpen] = useState(false);
  const [pinSetup, setPinSetup] = useState<"enable" | "change" | "disable" | null>(null);
  const authAvailable = getSupabase() !== null;

  useEffect(() => {
    registerServiceWorker();
  }, []);

  // Пока не ясно, нужен ли PIN, ничего не показываем — данные не должны мелькнуть до ввода PIN.
  if (lock.state.status === "loading") return <main className="flex-1" aria-busy />;

  if (lock.state.locked) {
    const inAccount = state.status === "account";
    return (
      <LockScreen
        verify={lock.verify}
        initialLockedUntil={lock.lockedUntil()}
        forgotText={
          inAccount
            ? "Выйдем из аккаунта на этом устройстве. Данные останутся в аккаунте: войдите снова по почте и задайте новый PIN-код."
            : "Данные хранятся только на этом устройстве, и без PIN-кода их не восстановить. Сброс удалит PIN-код и все отметки с этого устройства."
        }
        onForgot={async () => {
          if (inAccount) await signOut();
          else resetGuest();
          await lock.disable();
        }}
      />
    );
  }

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
          userId: state.userId,
          email: state.email,
          sync: state.sync,
          onSignOut: signOut,
          onDelete: async () => {
            await removeAccount();
            await lock.disable();
          },
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
          onReset={() => {
            resetGuest();
            lock.disable();
          }}
          account={account}
          onSignIn={openAuth}
          pin={{ enabled: lock.state.enabled, onSetup: setPinSetup }}
        />
      ) : (
        <Onboarding
          today={state.today}
          onDone={save}
          onSignIn={openAuth}
          onPartner={
            openAuth &&
            (() => {
              sessionStorage.setItem("start-tab", "pair");
              openAuth();
            })
          }
        />
      )}
      {pinSetup && (
        <PinSetupDialog
          mode={pinSetup}
          verify={lock.verify}
          onEnable={lock.enable}
          onDisable={lock.disable}
          onClose={() => setPinSetup(null)}
        />
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
