"use client";

import { useEffect, useState } from "react";
import type { IsoDate } from "@/lib/cycle/dates";
import { clearGuestData, loadGuestData, saveGuestData, type GuestData } from "@/lib/guest/store";
import { todayLocal } from "@/lib/format";
import { Home } from "./Home";
import { Onboarding } from "./Onboarding";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: GuestData | null; today: IsoDate };

export function App() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    loadGuestData()
      .then((data) => setState({ status: "ready", data, today: todayLocal() }))
      .catch(() => setState({ status: "error" }));
  }, []);

  // Если вкладка открыта через полночь — обновляем «сегодня».
  useEffect(() => {
    const refresh = () =>
      setState((s) => (s.status === "ready" && s.today !== todayLocal() ? { ...s, today: todayLocal() } : s));
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  if (state.status === "loading") return <main className="flex-1" aria-busy />;

  if (state.status === "error") {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-3 px-4">
        <h1 className="text-xl font-semibold">Не получилось открыть хранилище</h1>
        <p className="text-muted">
          Браузер не даёт сохранять данные на устройстве — так бывает в режиме инкогнито или при запрете
          хранения данных сайтов. Откройте сайт в обычной вкладке.
        </p>
      </main>
    );
  }

  const save = (data: GuestData) => {
    setState({ ...state, data });
    saveGuestData(data).catch(() => setState({ status: "error" }));
  };

  const reset = () => {
    setState({ ...state, data: null });
    clearGuestData().catch(() => setState({ status: "error" }));
  };

  return state.data ? (
    <Home data={state.data} today={state.today} onChange={save} onReset={reset} />
  ) : (
    <Onboarding today={state.today} onDone={save} />
  );
}
