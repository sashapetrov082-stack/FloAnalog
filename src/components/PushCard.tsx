"use client";

import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushState, pushConfigured, type PushState } from "@/lib/push";
import { getSupabase } from "@/lib/supabase/client";
import { Button, Card } from "./ui";

/** Настройка push-уведомлений на этом устройстве. */
export function PushCard({ partnerMode }: { partnerMode: boolean }) {
  const sb = getSupabase();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPushState().then(setState, () => setState("unsupported"));
  }, []);

  if (!sb || !pushConfigured() || !state) return null;

  const what = partnerMode
    ? "новый статус дня, заметки, просьбы и рисунки"
    : "заметки и рисунки от партнёра, выполненные просьбы, напоминание за 2 дня до нового цикла и о контрацепции, если оно включено";

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Уведомления</h2>
      {state === "ios-install" && (
        <p className="text-sm text-muted">
          На iPhone уведомления работают, только если добавить приложение на экран «Домой»: в Safari нажмите
          «Поделиться» → «На экран „Домой“», откройте приложение оттуда и вернитесь в настройки.
        </p>
      )}
      {state === "unsupported" && (
        <p className="text-sm text-muted">Этот браузер не поддерживает уведомления. Попробуйте Chrome, Safari или Firefox.</p>
      )}
      {state === "denied" && (
        <p className="text-sm text-muted">
          Уведомления запрещены в настройках браузера для этого сайта. Разрешите их там, затем вернитесь сюда.
        </p>
      )}
      {(state === "off" || state === "on") && (
        <>
          <p className="text-sm text-muted">
            {state === "on" ? "Включены на этом устройстве" : "Сообщим"}: {what}. Тексты нейтральные — без подробностей
            на экране блокировки.
          </p>
          <Button
            variant={state === "on" ? "ghost" : "secondary"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                if (state === "on") {
                  await disablePush(sb);
                  setState("off");
                } else {
                  setState(await enablePush(sb));
                }
              } catch {
                setError("Не получилось включить уведомления. Попробуйте ещё раз или в другом браузере.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {state === "on" ? "Выключить уведомления" : "Включить уведомления"}
          </Button>
        </>
      )}
      {error && <p className="text-sm text-warning">{error}</p>}
    </Card>
  );
}
