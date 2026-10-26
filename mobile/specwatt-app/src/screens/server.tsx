import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ApiError, BrainClient, createTokenVault } from "../specwatt/api";
import type {
  ServerCommand,
  ServerController,
  ServerSnapshot,
} from "../specwatt/api";
import { Copy, CTA, Panel } from "../specwatt/ui";
import { sty, theme } from "../specwatt/theme";
import { useSpec } from "../specwatt/store";

const unresolved = (command: ServerCommand) =>
  ["requested", "sent", "timeout", "transport-error"].includes(command.status);

export default function ServerScreen() {
  const { data } = useSpec();
  const w = (ru: string, ky: string) => (data.locale === "ky" ? ky : ru);
  const vault = useMemo(() => createTokenVault(Platform.OS !== "web"), []);
  const initial = useMemo(
    () =>
      new BrainClient({
        baseUrl: __DEV__
          ? Platform.OS === "android"
            ? "http://10.0.2.2:8000"
            : "http://127.0.0.1:8000"
          : "https://localhost:8000",
        development: __DEV__,
        vault,
      }),
    [vault],
  );
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [client, setClient] = useState<BrainClient | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [controllers, setControllers] = useState<ServerController[]>([]);
  const [snapshot, setSnapshot] = useState<ServerSnapshot | null>(null);
  const [commands, setCommands] = useState<ServerCommand[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lock = useRef(false);
  const serial = useRef(0);
  const mounted = useRef(true);

  function clearSession() {
    setClient(null);
    setControllers([]);
    setSnapshot(null);
    setCommands([]);
    setUncertain(false);
  }
  async function run(action: () => Promise<void>, commandAction = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      const code =
        failure instanceof ApiError ? failure.code : "operation_failed";
      if (
        commandAction &&
        ["request_timeout", "network_error", "invalid_response"].includes(code)
      )
        setUncertain(true);
      if (
        [
          "session_required",
          "session_expired",
          "invalid_session",
          "authentication_required",
          "http_401",
        ].includes(code)
      )
        clearSession();
      if (mounted.current) setError(code);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        if (!(await initial.hasSession())) return;
        const rows = await initial.controllers();
        if (mounted.current) {
          setClient(initial);
          setControllers(rows);
        }
      } catch (failure) {
        if (mounted.current)
          setError(
            failure instanceof ApiError ? failure.code : "operation_failed",
          );
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [initial]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function refresh(id: string, connection = client) {
    if (!connection) return;
    const value = await connection.snapshot(id);
    const history = await connection.commands(id);
    setSnapshot(value);
    setCommands(history);
    setUncertain(false);
  }

  const messages: Record<string, string> = {
    invalid_url: w(
      "Нужен HTTPS-адрес без пути, логина и параметров. В разработке HTTP разрешён только для localhost, 127.0.0.1, ::1 и 10.0.2.2.",
      "Жолу жана параметрлери жок HTTPS дарек керек. Иштеп чыгууда HTTP localhost, 127.0.0.1, ::1 жана 10.0.2.2 үчүн гана уруксат.",
    ),
    invalid_credentials_format: w(
      "Введите email и пароль от 12 до 128 символов.",
      "Email жана 12–128 белгиден турган сырсөз киргизиңиз.",
    ),
    invalid_credentials: w(
      "Email или пароль неверен.",
      "Email же сырсөз туура эмес.",
    ),
    registration_unavailable: w(
      "Регистрация с этими данными недоступна. Попробуйте войти.",
      "Бул маалымат менен катталуу мүмкүн эмес. Кирип көрүңүз.",
    ),
    request_timeout: w(
      "Сервер не ответил вовремя. Команда могла быть принята: обновите состояние, прежде чем продолжать.",
      "Сервер убагында жооп берген жок. Буйрук кабыл алынышы мүмкүн: улантуудан мурда абалды жаңыртыңыз.",
    ),
    network_error: w(
      "Нет связи с сервером. Проверьте адрес, запуск FastAPI и настройки сети. Команды автоматически не повторяются.",
      "Сервер менен байланыш жок. Даректи, FastAPI жана тармакты текшериңиз. Буйруктар автоматтык кайталанбайт.",
    ),
    stale_measurements: w(
      "Измерения устарели. Явно обновите телеметрию симулятора.",
      "Өлчөөлөр эскирди. Симулятордун телеметриясын жаңыртыңыз.",
    ),
    peak_exceeded: w(
      "Команда превысит предел 7 Вт. Сначала выключите CH1 и подтвердите шаг симулятора, затем включите CH2.",
      "Буйрук 7 Вт чектен ашат. Адегенде CH1ди өчүрүп, симулятордун кадамын ырастап, андан кийин CH2ни күйгүзүңүз.",
    ),
    unresolved_command: w(
      "Есть неподтверждённая команда. Проверьте её результат.",
      "Ырастала элек буйрук бар. Анын жыйынтыгын текшериңиз.",
    ),
    protected_channel: w(
      "CH3 защищён. Переключение запрещено.",
      "CH3 корголгон. Которууга тыюу салынат.",
    ),
    invalid_response: w(
      "Ответ сервера не соответствует контракту SpecWATT.",
      "Сервердин жообу SpecWATT келишимине туура келбейт.",
    ),
    invalid_name: w(
      "Введите название до 80 символов.",
      "80 белгиге чейинки ат киргизиңиз.",
    ),
    session_required: w("Войдите в серверную сессию.", "Серверге кириңиз."),
    session_expired: w(
      "Сессия истекла. Войдите заново.",
      "Сессиянын мөөнөтү бүттү. Кайра кириңиз.",
    ),
    invalid_session: w(
      "Сессия недействительна. Войдите заново.",
      "Сессия жараксыз. Кайра кириңиз.",
    ),
    rate_limited: w(
      "Слишком много запросов. Повторите позже.",
      "Суроо өтө көп. Кийин кайталаңыз.",
    ),
    http_429: w(
      "Слишком много запросов. Повторите позже.",
      "Суроо өтө көп. Кийин кайталаңыз.",
    ),
    simulator_confirmed: w(
      "Подтверждение серверного симулятора.",
      "Сервердик симулятордун ырастоосу.",
    ),
    simulator_injected_failure: w(
      "Симулятор воспроизвёл ошибку передачи.",
      "Симулятор жөнөтүү катасын кайталады.",
    ),
    idempotency_conflict: w(
      "Этот идентификатор уже относится к другой команде. Обновите историю.",
      "Бул идентификатор башка буйрукка тиешелүү. Тарыхты жаңыртыңыз.",
    ),
    automation_not_allowed: w(
      "Автоматизация для канала не разрешена.",
      "Бул каналда автоматташтырууга уруксат жок.",
    ),
    manual_priority_active: w(
      "Действует временный ручной приоритет.",
      "Убактылуу кол артыкчылыгы иштеп жатат.",
    ),
    authentication_required: w(
      "Требуется вход на сервер.",
      "Серверге кирүү керек.",
    ),
    simulator_telemetry_matches_target: w(
      "Измеренное состояние совпало с целью. Это не доказывает доставку команды.",
      "Өлчөнгөн абал максатка дал келди. Бул буйрук жеткенин далилдебейт.",
    ),
    target_not_reached: w(
      "По телеметрии целевое состояние не достигнуто. Команда завершена без подтверждения выполнения.",
      "Телеметрия боюнча максаттуу абалга жеткен жок. Буйрук аткарылганы ырасталбастан аяктады.",
    ),
  };
  const status = (value: string) =>
    ({
      requested: w("Запрошена", "Суралды"),
      sent: w("Отправлена", "Жөнөтүлдү"),
      acknowledged: w("Подтверждена симулятором", "Симулятор ырастады"),
      rejected: w("Отклонена", "Четке кагылды"),
      timeout: w("Тайм-аут", "Күтүү мөөнөтү бүттү"),
      "transport-error": w("Ошибка передачи", "Жөнөтүү катасы"),
      reconciled: w("Сверена с телеметрией", "Телеметрия менен текшерилди"),
    })[value] ?? value;
  const waiting = commands.some(unresolved) || uncertain;
  const measuredFresh =
    snapshot?.freshness === "fresh" && now / 1000 - snapshot.measured_at <= 30;

  return (
    <SafeAreaView style={sty.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[sty.body, { paddingTop: 15 }]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/settings")
            }
            style={{ minHeight: 48, justifyContent: "center" }}
          >
            <Copy accent>‹ {w("Назад", "Артка")}</Copy>
          </Pressable>
          <Copy size={29}>{w("SpecWATT Brain", "SpecWATT Brain")}</Copy>
          <Panel style={{ gap: 8, backgroundColor: theme.raised }}>
            <Copy accent>
              {w("СЕРВЕРНЫЙ СИМУЛЯТОР", "СЕРВЕРДИК СИМУЛЯТОР")}
            </Copy>
            <Copy muted>
              {w(
                "Отдельное пространство FastAPI. Это не ESP32 и не физические измерения. Данные и команды не смешиваются с локальным демо.",
                "FastAPI үчүн өзүнчө мейкиндик. Бул ESP32 жана чыныгы өлчөө эмес. Маалыматтар жана буйруктар жергиликтүү демо менен аралашпайт.",
              )}
            </Copy>
          </Panel>
          {busy && (
            <ActivityIndicator
              color={theme.peach}
              accessibilityLabel={w("Запрос к серверу", "Серверге суроо")}
            />
          )}
          {!!error && (
            <Copy accessibilityRole="alert" style={{ color: theme.error }}>
              {messages[error] ??
                w(
                  "Операция не выполнена. Код: ",
                  "Аракет аткарылган жок. Код: ",
                ) + error}
            </Copy>
          )}
          {!client ? (
            <>
              <Copy muted>{w("Адрес сервера", "Сервердин дареги")}</Copy>
              <TextInput
                accessibilityLabel={w("Адрес сервера", "Сервердин дареги")}
                editable={!busy}
                style={sty.field}
                value={baseUrl}
                onChangeText={setBaseUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                maxLength={300}
              />
              <Copy muted size={12}>
                {w(
                  "Android-эмулятор: 10.0.2.2. Через adb reverse: localhost. На физическом устройстве используйте HTTPS. Веб-доступ требует явного CORS origin на сервере.",
                  "Android эмулятору: 10.0.2.2. adb reverse аркылуу: localhost. Чыныгы түзмөктө HTTPS колдонуңуз. Веб үчүн серверде так CORS origin керек.",
                )}
              </Copy>
              <View style={[sty.row, { gap: 10 }]}>
                {(["login", "register"] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mode === value }}
                    disabled={busy}
                    onPress={() => setMode(value)}
                    style={[
                      sty.card,
                      {
                        flex: 1,
                        backgroundColor:
                          mode === value ? theme.raised : theme.surface,
                      },
                    ]}
                  >
                    <Copy accent={mode === value}>
                      {value === "login"
                        ? w("Войти", "Кирүү")
                        : w("Регистрация", "Катталуу")}
                    </Copy>
                  </Pressable>
                ))}
              </View>
              <TextInput
                accessibilityLabel="Email"
                editable={!busy}
                style={sty.field}
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={theme.dim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                maxLength={254}
              />
              <TextInput
                accessibilityLabel={w("Пароль", "Сырсөз")}
                editable={!busy}
                style={sty.field}
                value={password}
                onChangeText={setPassword}
                placeholder={w(
                  "Пароль · не менее 12 символов",
                  "Сырсөз · кеминде 12 белги",
                )}
                placeholderTextColor={theme.dim}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                maxLength={128}
              />
              <CTA
                disabled={busy}
                label={
                  mode === "login"
                    ? w("Войти на сервер", "Серверге кирүү")
                    : w("Создать серверный аккаунт", "Серверде аккаунт түзүү")
                }
                onPress={() => {
                  void run(async () => {
                    const connection = new BrainClient({
                      baseUrl,
                      development: __DEV__,
                      vault,
                    });
                    try {
                      await connection.authenticate(mode, email, password);
                      setClient(connection);
                      setControllers(await connection.controllers());
                    } finally {
                      setPassword("");
                    }
                  });
                }}
              />
              <Copy muted size={12}>
                {w(
                  "Пароль не сохраняется. Токен Android хранится в SecureStore; в веб-превью — только в памяти. Сброс пароля и подтверждение почты пока не реализованы.",
                  "Сырсөз сакталбайт. Android токени SecureStore ичинде, вебде эс тутумда гана сакталат. Сырсөздү калыбына келтирүү жана почтаны ырастоо азырынча жок.",
                )}
              </Copy>
            </>
          ) : (
            <>
              <Copy muted size={12}>
                {client.baseUrl}
              </Copy>
              <Copy size={22}>
                {w("Мои симуляторы", "Менин симуляторлорум")}
              </Copy>
              {controllers.map((controller) => (
                <CTA
                  key={controller.id}
                  disabled={busy}
                  secondary
                  label={controller.name}
                  onPress={() => {
                    void run(() => refresh(controller.id));
                  }}
                />
              ))}
              {!controllers.length && (
                <Copy muted>
                  {w("Пока нет контроллеров.", "Азырынча контроллер жок.")}
                </Copy>
              )}
              <TextInput
                accessibilityLabel={w(
                  "Название симулятора",
                  "Симулятордун аты",
                )}
                editable={!busy}
                style={sty.field}
                value={name}
                onChangeText={setName}
                maxLength={80}
                placeholder={w(
                  "Название нового симулятора",
                  "Жаңы симулятордун аты",
                )}
                placeholderTextColor={theme.dim}
              />
              <CTA
                disabled={busy}
                secondary
                label={w(
                  "Создать серверный симулятор",
                  "Сервердик симулятор түзүү",
                )}
                onPress={() => {
                  void run(async () => {
                    const created = await client.createSimulator(name);
                    setName("");
                    setControllers(await client.controllers());
                    await refresh(created.id);
                  });
                }}
              />
              {snapshot && (
                <>
                  <Panel style={{ gap: 9 }}>
                    <Copy size={23}>{snapshot.name}</Copy>
                    <Copy accent size={35}>
                      {measuredFresh && snapshot.total_watts !== null
                        ? snapshot.total_watts.toFixed(1).replace(".", ",")
                        : "—"}{" "}
                      {w("Вт", "Вт")}
                    </Copy>
                    <Copy muted>
                      {measuredFresh
                        ? w(
                            "Телеметрия симулятора · свежая",
                            "Симулятордун жаңы телеметриясы",
                          )
                        : w(
                            "Телеметрия устарела или результат неизвестен",
                            "Телеметрия эскирген же жыйынтык белгисиз",
                          )}
                    </Copy>
                    <Copy muted size={12}>
                      {w("Допустимый пик: ", "Чектүү чоку: ")}
                      {snapshot.peak_watts} {w("Вт", "Вт")}
                    </Copy>
                  </Panel>
                  {snapshot.channels.map((channel) => (
                    <Panel key={channel.id} style={{ gap: 8 }}>
                      <Copy size={18}>
                        {channel.id} · {channel.assigned.name}
                      </Copy>
                      <Copy muted>
                        {channel.protected
                          ? w(
                              "Защищён · управление запрещено",
                              "Корголгон · башкарууга тыюу салынат",
                            )
                          : measuredFresh
                            ? `${channel.watts?.toFixed(1).replace(".", ",")} ${w("Вт", "Вт")}`
                            : w("Нет свежих измерений", "Жаңы өлчөө жок")}
                      </Copy>
                      {!channel.protected && (
                        <CTA
                          disabled={busy || waiting || !measuredFresh}
                          secondary
                          label={
                            (channel.watts ?? 0) > 0
                              ? w("Запросить выключение", "Өчүрүүнү суроо")
                              : w("Запросить включение", "Күйгүзүүнү суроо")
                          }
                          onPress={() => {
                            void run(async () => {
                              const key = `mobile-${Date.now()}-${++serial.current}`;
                              const command = await client.command(
                                snapshot.controller_id,
                                channel.id as "CH1" | "CH2",
                                !(channel.watts! > 0),
                                key,
                              );
                              setCommands((current) => [command, ...current]);
                            }, true);
                          }}
                        />
                      )}
                    </Panel>
                  ))}
                  <Copy muted size={12}>
                    {w(
                      "Запрос не меняет показания. Следующая кнопка явно запускает отправку и подтверждение серверным симулятором.",
                      "Суроо көрсөткүчтөрдү өзгөртпөйт. Кийинки баскыч сервердик симулятордо жөнөтүүнү жана ырастоону иштетет.",
                    )}
                  </Copy>
                  <CTA
                    disabled={
                      busy ||
                      !commands.some(
                        (command) => command.status === "requested",
                      )
                    }
                    label={w(
                      "Отправить и подтвердить · шаг симулятора",
                      "Жөнөтүү жана ырастоо · симулятор кадамы",
                    )}
                    onPress={() => {
                      void run(async () => {
                        setSnapshot(await client.step(snapshot.controller_id));
                        setCommands(
                          await client.commands(snapshot.controller_id),
                        );
                      }, true);
                    }}
                  />
                  <CTA
                    disabled={busy}
                    secondary
                    label={w(
                      "Обновить состояние и историю команд",
                      "Абалды жана буйруктар тарыхын жаңыртуу",
                    )}
                    onPress={() => {
                      void run(() => refresh(snapshot.controller_id));
                    }}
                  />
                  <CTA
                    disabled={busy}
                    secondary
                    label={w(
                      "Симулятор: повторить последний образец телеметрии",
                      "Симулятор: акыркы телеметрия үлгүсүн кайталоо",
                    )}
                    onPress={() => {
                      void run(async () => {
                        setSnapshot(
                          await client.sample(snapshot.controller_id, snapshot),
                        );
                        setCommands(
                          await client.commands(snapshot.controller_id),
                        );
                        setUncertain(false);
                      });
                    }}
                  />
                  <Copy muted size={12}>
                    {w(
                      "Образец создаёт только серверный симулятор из последних известных значений. Это не опрос оборудования.",
                      "Үлгүнү сервердик симулятор акыркы белгилүү маанилерден түзөт. Бул жабдууну сурамжылоо эмес.",
                    )}
                  </Copy>
                  {uncertain && (
                    <Copy accent>
                      {w(
                        "Результат запроса неизвестен. Обновите историю; автоматического повтора нет.",
                        "Суроонун жыйынтыгы белгисиз. Тарыхты жаңыртыңыз; автоматтык кайталоо жок.",
                      )}
                    </Copy>
                  )}
                  <Copy size={21}>
                    {w("Команды сервера", "Сервердин буйруктары")}
                  </Copy>
                  {commands.slice(0, 10).map((command) => (
                    <Panel key={command.id} style={{ gap: 5 }}>
                      <Copy>
                        {command.channel_id} ·{" "}
                        {command.on
                          ? w("Включить", "Күйгүзүү")
                          : w("Выключить", "Өчүрүү")}
                      </Copy>
                      <Copy accent>{status(command.status)}</Copy>
                      <Copy muted size={12}>
                        {command.transitions
                          .map((step) => status(step.status))
                          .join(" → ")}
                      </Copy>
                      {!!command.reason && (
                        <Copy muted size={12}>
                          {messages[command.reason] ?? command.reason}
                        </Copy>
                      )}
                    </Panel>
                  ))}
                </>
              )}
              <CTA
                disabled={busy}
                secondary
                label={w(
                  "Выйти и удалить локальный токен",
                  "Чыгуу жана жергиликтүү токенди өчүрүү",
                )}
                onPress={() => {
                  void run(async () => {
                    try {
                      await client.logout();
                    } finally {
                      clearSession();
                    }
                  });
                }}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
