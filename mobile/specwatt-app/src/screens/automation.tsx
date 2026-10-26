import React, { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { Copy, CTA, Photo } from "../specwatt/ui";
import { useSpec } from "../specwatt/store";
import { getPlan } from "../specwatt/model";
import { imageMap } from "../specwatt/images";
import {
  Shell,
  Header,
  Brand,
  Gauge,
  RowLink,
  Card,
  Empty,
  Toggle,
  Icon,
  ComparisonChart,
  formatW,
  useWords,
  s,
} from "../specwatt/mobile-ui";

export function planReason(
  reason: string,
  w: (ru: string, ky: string) => string,
) {
  const messages: Record<string, [string, string]> = {
    "already-running": [
      "LED-лента уже включена. Новый запуск не требуется.",
      "LED тасма күйүк. Кайра баштоо талап кылынбайт.",
    ],
    ready: [
      "Перенос разрешён: прогноз пика укладывается в лимит.",
      "Жылдырууга уруксат: болжолдуу чоку чектен ашпайт.",
    ],
    "not-demo": [
      "Подключите стенд или откройте демо.",
      "Стендди туташтырыңыз же демону ачыңыз.",
    ],
    "autopilot-off": [
      "Включите автопилот для применения.",
      "Колдонуу үчүн автопилотту күйгүзүңүз.",
    ],
    permission: [
      "Разрешите автоматизацию LED-ленты в настройках канала.",
      "Каналдын жөндөөлөрүндө LED тасманы автоматташтырууга уруксат бериңиз.",
    ],
    stale: [
      "Свежих измерений нет. Управление приостановлено.",
      "Жаңы өлчөөлөр жок. Башкаруу токтотулду.",
    ],
    "manual-priority": [
      "Действует ручной приоритет. Дождитесь его окончания.",
      "Кол менен башкаруу артыкчылыгы иштеп жатат. Аякташын күтүңүз.",
    ],
    "no-schedule": [
      "Настройте расписание LED-ленты.",
      "LED тасманын жадыбалын жөндөңүз.",
    ],
    "no-improvement": [
      "Перенос не улучшает пик при заданных ограничениях.",
      "Бул чектөөлөрдө жылдыруу чокуну төмөндөтпөйт.",
    ],
    "no-window": [
      "Допустимого временного окна нет. Измените расписание или лимит.",
      "Уруксат берилген убакыт терезеси жок. Жадыбалды же чекти өзгөртүңүз.",
    ],
    applied: [
      "План сохранён в деморасписании. Физические команды не отправлены.",
      "План демо жадыбалга сакталды. Жабдууга буйрук жөнөтүлгөн жок.",
    ],
    rejected: [
      "Предложение отклонено. Измените расписание для нового расчёта.",
      "Сунуш четке кагылды. Жаңы эсеп үчүн жадыбалды өзгөртүңүз.",
    ],
  };
  const m = messages[reason];
  return m ? w(...m) : reason;
}
function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function AutopilotScreen() {
  const { data, setAutopilot } = useSpec();
  const w = useWords();
  const now = useNow();
  const plan = getPlan(data, now);
  return (
    <Shell active="/autopilot">
      <Header
        title={
          <>
            {w("Авто", "Авто")}
            <Copy size={28} accent>
              {w("пилот", "пилот")}
            </Copy>
          </>
        }
        subtitle={w("Управление нагрузкой", "Жүктөмдү башкаруу")}
        icon="settings"
      />
      {!data.channels.length ? (
        <Empty />
      ) : (
        <>
          <Gauge
            bolt
            value={
              data.autopilot ? w("Включён", "Күйүк") : w("Выключен", "Өчүк")
            }
            subtitle={w(
              `Разрешено ${data.channels.filter((c) => !c.protected && c.assigned?.allowAuto).length} из 3 каналов`,
              `${data.channels.filter((c) => !c.protected && c.assigned?.allowAuto).length} / 3 каналга уруксат берилген`,
            )}
          />
          <View style={{ alignItems: "center", marginBottom: 3 }}>
            <Toggle
              label={w("Автопилот", "Автопилот")}
              value={data.autopilot}
              onChange={setAutopilot}
            />
          </View>
          <Pressable
            onPress={() => router.replace("/plan")}
            style={[s.card, { padding: 0, minHeight: 148 }]}
          >
            <Photo
              source={imageMap["led-strip"]}
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                width: "54%",
                height: 125,
                opacity: 0.7,
              }}
            />
            <View style={{ padding: 15, gap: 3 }}>
              <Copy muted size={12}>
                {w("Следующее предложение", "Кийинки сунуш")}
              </Copy>
              <Copy size={17}>LED-{w("лента", "тасма")} · CH2</Copy>
              <Copy size={40}>{plan.to || "—"}</Copy>
              <Copy muted size={12}>
                {w("После выключения светильника", "Чырак өчкөндөн кийин")}
              </Copy>
            </View>
          </Pressable>
          <RowLink
            icon="shield"
            accent
            title={w("Вентилятор защищён", "Желдеткич корголгон")}
            subtitle={w(
              "Не отключается и не участвует в переносе",
              "Өчүрүлбөйт жана жылдырылбайт",
            )}
            onPress={() =>
              router.push({ pathname: "/device", params: { id: "CH3" } })
            }
          />
          <Card style={{ padding: 0 }}>
            <RowLink
              icon="pulse"
              title={w("Допустимый пик", "Уруксат берилген чоку")}
              subtitle={w(
                "Максимальная суммарная нагрузка",
                "Эң чоң жалпы жүктөм",
              )}
              right={`${data.peak} Вт`}
              onPress={() => router.push("/settings")}
            />
            <RowLink
              icon="clock"
              title={w("Ручной приоритет", "Кол башкаруунун артыкчылыгы")}
              right={`${data.manualMinutes} ${w("мин", "мүн")}`}
              onPress={() => router.push("/settings")}
            />
          </Card>
          <RowLink
            icon="journal"
            accent
            title={w("Правила и разрешения", "Эрежелер жана уруксаттар")}
            subtitle={w("Настройка работы автопилота", "Автопилотту жөндөө")}
            onPress={() => router.push("/setup")}
          />
          <Copy size={12} muted style={{ textAlign: "center" }}>
            {planReason(plan.reason, w)}
          </Copy>
          <Copy size={12} muted style={{ textAlign: "center" }}>
            {w(
              "Демо · предложения, без физических команд",
              "Демо · сунуштар, жабдууга буйрук жок",
            )}
          </Copy>
        </>
      )}
    </Shell>
  );
}
export function PlanScreen() {
  const { data, applyPlan, rejectPlan } = useSpec();
  const w = useWords();
  const plan = getPlan(data, useNow());
  return (
    <Shell active="/plan">
      <Header
        title={<Brand />}
        subtitle={w(
          "План нагрузки · Сегодня · Демо",
          "Жүктөм планы · Бүгүн · Демо",
        )}
      />
      {!data.channels.length ? (
        <Empty />
      ) : (
        <>
          <View style={[s.between, { marginVertical: 3 }]}>
            <View>
              <Copy size={49}>
                {formatW(plan.beforePeak)}
                <Copy size={25}> Вт</Copy>
              </Copy>
              <Copy size={12} muted style={{ textAlign: "center" }}>
                {w("Без плана", "Плансыз")}
              </Copy>
            </View>
            <Icon name="next" size={26} />
            <View>
              <Copy size={49} accent>
                {formatW(plan.afterPeak)}
                <Copy accent size={25}>
                  {" "}
                  Вт
                </Copy>
              </Copy>
              <Copy size={12} muted style={{ textAlign: "center" }}>
                {w("По плану", "План боюнча")}
              </Copy>
            </View>
          </View>
          <ComparisonChart
            before={plan.before}
            after={plan.after}
            labels={plan.labels}
          />
          <Pressable
            onPress={() =>
              router.push({ pathname: "/device", params: { id: "CH2" } })
            }
            style={[
              s.card,
              { padding: 0, flexDirection: "row", minHeight: 113 },
            ]}
          >
            <Photo
              source={imageMap["led-strip"]}
              style={{ width: "39%", height: 113 }}
            />
            <View style={{ flex: 1, padding: 13, gap: 6 }}>
              <Copy size={13}>
                {w(
                  "Перенести запуск LED-ленты",
                  "LED тасманын башталышын жылдыруу",
                )}
              </Copy>
              <Copy size={26}>
                {plan.from} →{" "}
                <Copy size={26} accent>
                  {plan.to || "—"}
                </Copy>
              </Copy>
              <Copy muted size={12}>
                {w("После выключения светильника", "Чырак өчкөндөн кийин")}
              </Copy>
            </View>
          </Pressable>
          <RowLink
            icon="shield"
            accent
            title={w(
              "Вентилятор остаётся включённым",
              "Желдеткич күйүк бойдон калат",
            )}
            onPress={() =>
              router.push({ pathname: "/device", params: { id: "CH3" } })
            }
          />
          <Card style={{ flexDirection: "row", gap: 15, alignItems: "center" }}>
            <Icon name="info" />
            <View style={{ flex: 1 }}>
              <Copy size={14}>
                {w("Снижаем пик нагрузки", "Жүктөмдүн чокусун азайтабыз")}
              </Copy>
              <Copy muted size={12}>
                {w(
                  "Перенос не означает снижение расхода кВт·ч.",
                  "Жылдыруу кВт·с сарптоону азайтууну билдирбейт.",
                )}
              </Copy>
            </View>
          </Card>
          <Copy size={12} muted>
            {planReason(plan.reason, w)}
          </Copy>
          <CTA
            label={
              data.planStatus === "applied"
                ? w("План применён", "План колдонулду")
                : w("Применить план", "Планды колдонуу")
            }
            disabled={!plan.canApply}
            onPress={applyPlan}
          />
          <CTA
            secondary
            label={w("Отклонить", "Четке кагуу")}
            disabled={data.planStatus !== "pending"}
            onPress={rejectPlan}
          />
          <Copy size={12} muted style={{ textAlign: "center" }}>
            {w(
              "Расчётный пример · деморасписание",
              "Эсептөө үлгүсү · демо жадыбал",
            )}
          </Copy>
        </>
      )}
    </Shell>
  );
}
