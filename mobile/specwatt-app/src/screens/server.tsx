import React, { useMemo, useState } from "react";
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
import { Copy, CTA, Panel } from "../specwatt/ui";
import { sty, theme } from "../specwatt/theme";
import { useSpec } from "../specwatt/store";
import { useLive, defaultServerUrl } from "../specwatt/live-context";
import { t } from "../specwatt/i18n";
import {Details} from "./live-controls";

export default function ServerScreen() {
  const { data, enterDemo } = useSpec();
  const w = (ru: string, ky: string) => (data.locale === "ky" ? ky : ru);
  const {workspace,state}=useLive();
  const {client,controllers,busy,error}=state;
  const [baseUrl,setBaseUrl]=useState(defaultServerUrl);
  const [mode,setMode]=useState<"login"|"register">("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [name,setName]=useState("");
  const locale = data.locale;
  const messages = useMemo<Record<string, string>>(() => {
    const w = (ru: string, ky: string) => (locale === "ky" ? ky : ru);
    return {
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
    command_in_flight: w(
      "Предыдущая команда ещё не завершена на сервере. Дождитесь её результата или обновите историю.",
      "Мурунку буйрук серверде аякта элек. Анын жыйынтыгын күтүңүз же тарыхты жаңыртыңыз.",
    ),
    controller_not_found: w(
      "Симулятор не найден или удалён на сервере. Обновите список симуляторов.",
      "Симулятор табылган жок же серверден өчүрүлгөн. Симуляторлор тизмесин жаңыртыңыз.",
    ),
    server_busy: w(
      "Сервер перегружен. Повторите попытку позже.",
      "Сервер жүктөлүп калды. Кийин кайталаңыз.",
    ),
    schedule_cancelled: w(
      "Отменено до отправки: расписание было отменено.",
      "Жөнөтүлгөнгө чейин жокко чыгарылды: график жокко чыгарылган.",
    ),
    http_404: w(
      "Сервер не нашёл запрошенный объект. Обновите состояние.",
      "Сервер сураган объектти тапкан жок. Абалды жаңыртыңыз.",
    ),
    http_401: w(
      "Сессия недействительна. Войдите заново.",
      "Сессия жараксыз. Кайра кириңиз.",
    ),
    };
  }, [locale]);
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
                "Войдите и выберите свой контроллер. Его состояние появится во всех вкладках. Здесь используется серверная симуляция, а не физические измерения.",
                "Кирип, контроллерди тандаңыз. Анын абалы бардык өтмөктөрдө көрүнөт. Бул сервердик симуляция, чыныгы өлчөө эмес.",
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
              <Details label={w("О подключении", "Байланыш жөнүндө")}>
                <Copy muted size={14}>{w("Адрес и выбранный контроллер действуют в текущем сеансе. В веб-превью после перезагрузки страницы потребуется войти и выбрать контроллер снова. Пароль не сохраняется.", "Дарек жана тандалган контроллер учурдагы сеанста иштейт. Веб-барак жаңыртылгандан кийин кайра кирип, контроллерди тандоо керек. Сырсөз сакталбайт.")}</Copy>
                <Copy muted size={14}>{w("Локальная разработка: Android-эмулятор 10.0.2.2, веб 127.0.0.1. Веб-доступ требует разрешённого адреса CORS на сервере.", "Жергиликтүү иштеп чыгуу: Android эмулятору 10.0.2.2, веб 127.0.0.1. Веб үчүн серверде уруксат берилген CORS дареги керек.")}</Copy>
              </Details>
              <View style={[sty.row, { gap: 10 }]}>
                {(["login", "register"] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mode === value }}
                    disabled={busy}
                    onPress={() => { setMode(value); setPassword(""); setShowPassword(false);  }}
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
                autoComplete="email"
                textContentType="emailAddress"
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
                secureTextEntry={!showPassword}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                textContentType={mode === "login" ? "password" : "newPassword"}
                maxLength={128}
              />
              <CTA secondary disabled={busy}
                label={t(locale, showPassword ? "hidePassword" : "showPassword")}
                onPress={() => setShowPassword(!showPassword)} />
              <CTA
                disabled={busy}
                label={
                  mode === "login"
                    ? w("Войти на сервер", "Серверге кирүү")
                    : w("Создать серверный аккаунт", "Серверде аккаунт түзүү")
                }
                onPress={() => {
                  void workspace.authenticate(baseUrl,mode,email,password).finally(()=>{setPassword("");setShowPassword(false);});
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
              <Copy muted size={14}>{client.baseUrl}</Copy>
              <Copy size={24}>{w("Мои контроллеры", "Менин контроллерлорум")}</Copy>
              {!controllers.length && <Panel style={{gap:8}}><Copy>{w("Контроллеров пока нет", "Азырынча контроллер жок")}</Copy><Copy muted>{w("Создайте серверный симулятор, чтобы проверить весь сценарий без оборудования.", "Жабдуусуз текшерүү үчүн сервердик симулятор түзүңүз.")}</Copy></Panel>}
              {controllers.map(controller=><CTA key={controller.id} secondary disabled={busy||state.refreshing} label={controller.name} onPress={()=>{
                void workspace.select(controller.id).then(()=>router.replace("/home"));
              }}/>)}
              <TextInput accessibilityLabel={w("Название симулятора", "Симулятордун аты")} editable={!busy} style={sty.field} value={name} onChangeText={setName} maxLength={80} placeholder={w("Название нового симулятора", "Жаңы симулятордун аты")} placeholderTextColor={theme.dim}/>
              <CTA secondary disabled={busy||!name.trim()} label={w("Создать серверный симулятор", "Сервердик симулятор түзүү")} onPress={()=>{
                void workspace.create(name).then(()=>{if(workspace.getState().selectedId)router.replace("/home");});
              }}/>
              <CTA secondary disabled={busy} label={w("Выйти и удалить локальный токен", "Чыгуу жана жергиликтүү токенди өчүрүү")} onPress={()=>void workspace.logout()}/>
            </>
          )}
          <CTA secondary label={w("Перейти в DEMO", "DEMO режимине өтүү")} onPress={()=>{workspace.demo();enterDemo();router.replace("/home");}}/>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
