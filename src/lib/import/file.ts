// Чтение файла экспорта в браузере: JSON, .cluedata, текст или zip-архив без пароля.
// Файл никуда не отправляется — разбирается прямо на устройстве.

import { unzipSync, strFromU8 } from "fflate";
import type { Period } from "@/lib/cycle/predict";
import { extractPeriodsFromJson, parseDateList } from "./periods";

export class ImportError extends Error {}

function fromText(text: string): Period[] {
  try {
    return extractPeriodsFromJson(JSON.parse(text));
  } catch (e) {
    if (e instanceof ImportError) throw e;
    // Не JSON — пробуем как список дат.
    return parseDateList(text).periods;
  }
}

export async function readImportFile(file: File): Promise<Period[]> {
  if (file.size > 50 * 1024 * 1024) throw new ImportError("Файл слишком большой (больше 50 МБ).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return fromText(new TextDecoder().decode(bytes));

  const passwordMessage =
    "Архив защищён паролем. Распакуйте его на телефоне или компьютере паролем из письма и выберите файл .json из архива.";
  // Флаг шифрования — младший бит поля «флаги» в заголовке первого файла архива.
  if (bytes[6] & 1) throw new ImportError(passwordMessage);

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new ImportError(passwordMessage);
  }
  const names = Object.keys(entries).filter((n) => /\.(json|cluedata|txt)$/i.test(n) && !n.startsWith("__MACOSX"));
  // В архиве Clue данные отметок лежат в measurements.json; остальные файлы — настройки и напоминания.
  const preferred = names.filter((n) => /measurements\.json$/i.test(n));
  const chosen = preferred.length ? preferred : names;
  if (chosen.length === 0) throw new ImportError("В архиве не нашлось файлов с данными (.json).");
  return chosen.flatMap((n) => fromText(strFromU8(entries[n])));
}
