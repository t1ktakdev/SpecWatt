import {DeviceVisual} from "../specwatt/device-visual";
import { MotionPressable as Pressable } from '../specwatt/motion';
import React, { useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Copy, CTA } from "../specwatt/ui";
import { useSpec } from "../specwatt/store";
import { getPlan } from "../specwatt/model";
import {
  Shell,
  Header,
  Brand,
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
          <Card style={{gap:16}}>
            <View style={{flexDirection:'row',gap:16,alignItems:'center'}}>
              <View style={{flex:1,gap:6}}>
                <Copy size={13} muted>{w("Состояние автопилота","Автопилоттун абалы")}</Copy>
                <Copy size={30} accent={data.autopilot}>{data.autopilot?w("Включён","Күйүк"):w("Выключен","Өчүк")}</Copy>
              </View>
              <Toggle label={w("Автопилот","Автопилот")} value={data.autopilot} onChange={setAutopilot}/>
            </View>
            <Copy size={14} muted>{w(
              `Разрешено ${data.channels.filter(c=>!c.protected&&c.assigned?.allowAuto).length} из ${data.channels.filter(c=>!c.protected).length} управляемых каналов`,
              `${data.channels.filter(c=>!c.protected&&c.assigned?.allowAuto).length} / ${data.channels.filter(c=>!c.protected).length} башкарылуучу каналга уруксат берилген`
            )}</Copy>
            <Copy size={13} muted>{planReason(plan.reason,w)}</Copy>
          </Card>
          <Pressable accessibilityRole="button" accessibilityLabel={w("Открыть предложение плана","План сунушун ачуу")} onPress={()=>router.replace("/plan")} style={[s.card,{gap:12}]}>
            <Copy size={12} accent>{w("ПРЕДЛОЖЕНИЕ · ДЕМО","СУНУШ · ДЕМО")}</Copy>
            <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
              <DeviceVisual assignment={data.channels.find(c=>c.id==="CH2")?.assigned} id="CH2" style={{width:96,height:96}}/>
              <View style={{flex:1,gap:4}}>
                <Copy size={18}>{data.channels.find(c=>c.id==="CH2")?.assigned?.name||w("LED-лента","LED-тасма")} · CH2</Copy>
                <Copy size={32}>{plan.to||"—"}</Copy>
                <Copy muted size={13}>{w("После выключения светильника","Чырак өчкөндөн кийин")}</Copy>
              </View>
            </View>
            <Copy size={12} muted>{w("Предложение не является выполненной командой","Сунуш аткарылган буйрук эмес")}</Copy>
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
          <Card style={{ padding: 0, borderWidth: 0, backgroundColor: "transparent", gap: 12 }}>
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
  const {width,fontScale}=useWindowDimensions();
  const stacked=width<360||fontScale>1.2;
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
          <View style={[s.between, { marginVertical: 4, flexWrap: "wrap", alignItems: "flex-start" }]}>
            <View>
              <Copy size={stacked?36:44}>
                {formatW(plan.beforePeak)}
                <Copy size={18}> Вт</Copy>
              </Copy>
              <Copy size={12} muted style={{ textAlign: "center" }}>
                {w("Без плана", "Плансыз")}
              </Copy>
            </View>
            <Icon name="next" size={26} />
            <View>
              <Copy size={stacked?36:44} accent>
                {formatW(plan.afterPeak)}
                <Copy accent size={18}>
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
              { padding: 12, flexDirection: stacked ? "column" : "row", alignItems: "center", minHeight: 113 },
            ]}
          >
            <DeviceVisual
              assignment={data.channels.find(c=>c.id==="CH2")?.assigned} id="CH2"
              style={{ width: stacked ? "100%" : 104, height: 112 }}
            />
            <View style={{ flex: 1, padding: 8, gap: 6, minWidth: 0 }}>
              <Copy size={13}>
                {w(
                  "Перенести запуск LED-ленты",
                  "LED тасманын башталышын жылдыруу",
                )}
              </Copy>
              <Copy size={24}>
                {plan.from} →{" "}
                <Copy size={24} accent>
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
                  "Жылдыруу энергия сарптоону азайтууну билдирбейт.",
                )}
              </Copy>
              {plan.beforeEnergyWh!==undefined&&plan.afterEnergyWh!==undefined&&<Copy size={12} muted>{w('Энергия окна','Убакыт терезесиндеги энергия')}: {plan.beforeEnergyWh.toFixed(1).replace('.',',')} → {plan.afterEnergyWh.toFixed(1).replace('.',',')} Wh</Copy>}
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
