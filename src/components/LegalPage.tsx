import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal";

/** Оформление страниц с документами: заголовок, дата, плашка «черновик», ссылки между документами. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/" className="text-accent underline-offset-4 hover:underline">
          ← В приложение
        </Link>
        <Link href="/privacy" className="text-muted underline-offset-4 hover:underline">
          Политика конфиденциальности
        </Link>
        <Link href="/terms" className="text-muted underline-offset-4 hover:underline">
          Пользовательское соглашение
        </Link>
      </nav>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">Обновлено: {LEGAL.updated}</p>
      {LEGAL.draft && (
        <p className="mt-4 rounded-2xl bg-warning-soft p-4 text-sm text-warning">
          Черновик для закрытого тестирования. До публичного запуска документ будет проверен юристом и может
          измениться — об изменениях сообщим заранее.
        </p>
      )}
      <article className="legal mt-8">{children}</article>
    </main>
  );
}
