# Help / Safety / Privacy module — integration guide

Ветка `feature/help-safety-center`. Модуль самодостаточен: весь код лежит в
`mobile/specwatt-app/src/features/help-safety/`, общие файлы навигации и
экраны не изменялись. Три новых роута в `src/app/` — тонкие однострочные
обёртки по существующей конвенции (`settings.tsx`, `devices.tsx` и т.д.).

## Что добавлено

| Файл | Назначение |
|---|---|
| `src/features/help-safety/content.ts` | Чистый TS: 9 статей помощи (RU/KY), 5 правил безопасности, 6 разделов приватности, черновик политики с помеченными реквизитами, строки UI и локальный поиск (нормализация, токены, ранжирование) |
| `src/features/help-safety/icons.tsx` | Модульные stroke-иконки в стиле общего каталога (аддитивно, общий каталог не изменён) |
| `src/features/help-safety/ui.tsx` | `Expandable` (плавный аккордеон на RN Animated с учётом reduce motion), `SearchField`, `PressableCard`, `RuleBadge` |
| `src/features/help-safety/HelpCenterScreen.tsx` | Центр помощи: категории-чипы, поиск, раскрывающиеся ответы, пустое состояние поиска |
| `src/features/help-safety/SafetyCenterScreen.tsx` | Центр безопасности: 5 правил, соответствующих реальной модели данных |
| `src/features/help-safety/PrivacyCenterScreen.tsx` | Приватность и данные: без фиктивных кнопок — реальные экспорт/очистка остаются в настройках, отсюда ссылки на них |
| `src/app/help.tsx`, `src/app/safety.tsx`, `src/app/privacy.tsx` | Роуты `/help`, `/safety`, `/privacy` |
| `tests/help-safety.test.mjs` | 12 тестов: контент-паритет RU/KY, поиск, строки, соответствие модели |

## Подключение ссылок из интерфейса (по желанию команды)

Роуты уже работают (`router.push("/help")`). Чтобы пользователи могли
попасть в разделы, добавьте в `src/screens/settings.tsx` три `RowLink`
после блока «Серверный симулятор»:

```tsx
<RowLink
  icon="info"
  title={w("Центр помощи", "Жардам борбору")}
  onPress={() => router.push("/help")}
/>
<RowLink
  icon="shield"
  title={w("Безопасность", "Коопсуздук")}
  onPress={() => router.push("/safety")}
/>
<RowLink
  icon="info"
  title={w("Приватность и данные", "Купуялык жана маалымат")}
  onPress={() => router.push("/privacy")}
/>
```

Или один составной пункт, если меньше ссылок:

```tsx
<RowLink
  icon="info"
  title={w("Помощь и безопасность", "Жардам жана коопсуздук")}
  onPress={() => router.push("/help")}
/>
```

Вариант вместо правки настроек: поставить ссылки на главную или на
onboarding — экраны экспортируются из `src/features/help-safety`:

```tsx
import { HelpCenterScreen } from "../features/help-safety";
```

Глубокая ссылка на конкретную статью: `router.push("/help?topic=connection-lost")`
— статья откроется раскрытой.

## Проверки

- `npm test` — 37/37 (25 существующих + 12 новых).
- `npm run typecheck`, `npm run lint` — чисто.
- `npx expo export --platform android` — бандл собирается.

Ограничения: нативная Android-проверка (устройство/эмулятор, TalkBack)
этой веткой не выполнялась и остаётся командной проверкой по
`docs/ANDROID-BUILD.md`. KY-перевод — черновик (как и весь KY в проекте)
требует проверки носителем. Юридический текст в Privacy Center — тот же
черновик, что в настройках; реквизиты оператора/контакты явно помечены
как требующие подтверждения владельца и не выдумывались.
