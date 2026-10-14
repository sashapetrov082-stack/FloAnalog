export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Трекер цикла</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Календарь, прогноз и режим пары. Скоро здесь появится онбординг.
      </p>
      <p className="text-sm text-zinc-500">
        Приложение не является методом контрацепции и не ставит диагнозов.
      </p>
    </main>
  );
}
