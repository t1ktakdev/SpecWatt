import {DeviceVisual,defaultDeviceConfig} from "../specwatt/device-visual";
import {validateIllustrationConfig} from "../specwatt/illustrations";
import {importDevicePhoto,pruneDevicePhotos} from "../specwatt/photos";
import {Toggle} from "../specwatt/mobile-ui";
import { MotionPressable as Pressable } from '../specwatt/motion';
import React, { useState, useCallback, useRef } from "react";
import { View, ScrollView, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Copy, CTA, Panel } from "../specwatt/ui";
import { theme, sty } from "../specwatt/theme";
import { useSpec, ChannelId, Assign } from "../specwatt/store";
import { t } from "../specwatt/i18n";
type Step = "overview" | "channels" | "assign" | "done";
const defaults: Assign = {
  name: "",
  category: "lamp",
  image: "lamp",
  room: "Гостиная",
  allowAuto: false,
};
export default function Setup() {
  const { data, enterDemo, assign } = useSpec();
  const locale = data.locale;
  const params=useLocalSearchParams<{channel?:string;illustration?:string}>();
  const consumed=useRef('');
  const [importing,setImporting]=useState(false);

  const [step, setStep] = useState<Step>("overview");
  const [selected, setSelected] = useState<ChannelId>("CH1");
  const [draft, setDraft] = useState<Assign>(defaults);
  const [error, setError] = useState("");
  useFocusEffect(useCallback(()=>{
   if(!params.channel||!['CH1','CH2','CH3'].includes(params.channel)||!params.illustration)return;
   const key=params.channel+params.illustration;if(consumed.current===key)return;consumed.current=key;
   try{const config=validateIllustrationConfig(JSON.parse(params.illustration));if(!config)return;const id=params.channel as ChannelId;setSelected(id);setDraft(d=>({...d,appearance:{kind:'vector',config}}));setStep('assign');}catch{}
  },[params.channel,params.illustration]));
  const words = (ru: string, ky: string) => (locale === "ky" ? ky : ru);
  function pickChannel(ch: ChannelId) {
    const channel = data.channels.find((c) => c.id === ch);
    setSelected(ch);
    setDraft(channel?.assigned || { ...defaults, name: "" });
    setError("");
    setStep("assign");
  }
  function save() {
    if (
      !draft.name.trim() ||
      draft.name.length > 80 ||
      draft.room.length > 80
    ) {
      setError(
        words(
          "Название обязательно; название и помещение — до 80 символов.",
          "Ат милдеттүү; ат жана бөлмө 80 белгиден ашпасын.",
        ),
      );
      return;
    }
    assign(selected, { ...draft, name: draft.name.trim() });
    try{pruneDevicePhotos([...data.channels.filter(c=>c.id!==selected).flatMap(c=>c.assigned?.appearance?.kind==='photo'?[c.assigned.appearance.uri]:[]),...(draft.appearance?.kind==='photo'?[draft.appearance.uri]:[])]);}catch{}
    setError("");
    setStep("done");
  }
  async function choosePhoto(){
    setImporting(true);setError('');
    try{const uri=await importDevicePhoto();if(uri)setDraft(d=>({...d,appearance:{kind:'photo',uri}}));}
    catch{setError(words('Не удалось импортировать фото. Выберите JPG/PNG до 15 МБ; импорт доступен на Android.','Сүрөт импорттолгон жок. 15 МБ чейин JPG/PNG тандаңыз; импорт Androidдо жеткиликтүү.'));}
    finally{setImporting(false);}
  }
  return (
    <SafeAreaView style={sty.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[sty.body, { paddingTop: 24 }]}
      >
        <View style={[sty.row, { justifyContent: "space-between" }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              step === "overview" ? router.back() : setStep("channels")
            }
            style={{ minWidth: 52, minHeight: 50, justifyContent: "center" }}
          >
            <Copy accent>‹ {t(locale, "back")}</Copy>
          </Pressable>
          <Copy muted size={12}>
            SPECWATT / CH1–CH3
          </Copy>
        </View>
        {step === "overview" && (
          <>
            <Copy size={31}>
              {words("Подключение стенда", "Стендди туташтыруу")}
            </Copy>
            <Panel style={{ backgroundColor: theme.raised, gap: 9 }}>
              <Copy size={12} accent>
                5 В · НИЗКОВОЛЬТНЫЙ СТЕНД
              </Copy>
              <Copy size={26}>
                {words("Контроллер и каналы", "Контроллер жана каналдар")}
              </Copy>
              <Copy muted>
                {words(
                  "Реальное обнаружение ESP32/LAN ещё не подключено. Симуляция не управляет оборудованием.",
                  "ESP32/LAN чыныгы издөө азырынча кошулган эмес. Симуляция жабдууну башкарбайт.",
                )}
              </Copy>
            </Panel>
            <Copy size={16}>
              {words("Что будет доступно", "Эмне жеткиликтүү болот")}
            </Copy>
            <View style={sty.card}>
              <Copy>CH1 / CH2</Copy>
              <Copy muted>
                {words(
                  "Назначение приборов и разрешений",
                  "Түзмөктөрдү жана уруксаттарды дайындоо",
                )}
              </Copy>
            </View>
            <View style={sty.card}>
              <Copy accent>CH3 · {t(locale, "protected")}</Copy>
              <Copy muted>
                {words(
                  "В учебной конфигурации ручное управление и автопилот запрещены.",
                  "Окуу конфигурациясында кол менен жана автоматтык башкарууга тыюу салынат.",
                )}
              </Copy>
            </View>
            <CTA
              label={
                data.source === "demo"
                  ? words(
                      "Настроить текущие каналы",
                      "Учурдагы каналдарды жөндөө",
                    )
                  : words("Открыть учебную симуляцию", "Окуу симуляциясын ачуу")
              }
              onPress={() => {
                if (data.source !== "demo") enterDemo();
                setStep("channels");
              }}
            />
            <CTA
              secondary
              label={words("Без устройств", "Түзмөктөрсүз")}
              onPress={() => router.replace("/home")}
            />
          </>
        )}
        {step === "channels" && (
          <>
            <Copy size={31}>{t(locale, "channels")}</Copy>
            <Copy muted>
              {t(locale, "simulation")} ·{" "}
              {words(
                "Три виртуальных канала, не реальный поиск LAN.",
                "Үч виртуалдык канал, чыныгы LAN издөөсү эмес.",
              )}
            </Copy>
            {(["CH1", "CH2", "CH3"] as ChannelId[]).map((id) => {
              const ch = data.channels.find((c) => c.id === id),
                value = ch?.assigned;
              return (
                <Pressable
                  key={id}
                  onPress={() => pickChannel(id)}
                  accessibilityRole="button"
                  style={[
                    sty.card,
                    {
                      flexDirection: "row",
                      gap: 16,
                      alignItems: "center",
                      minHeight: 128,
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 7 }}>
                    <Copy size={21} accent>
                      {id}
                    </Copy>
                    <Copy size={17}>
                      {value?.name || words("Не назначен", "Дайындалган эмес")}
                    </Copy>
                    <Copy muted>
                      {id === "CH3"
                        ? t(locale, "protected")
                        : words(
                            "Назначить и настроить",
                            "Дайындоо жана жөндөө",
                          )}
                    </Copy>
                  </View>
                  <DeviceVisual assignment={value} id={id}
                    style={{ width: 105, height: 103, borderRadius: 16 }}
                  />
                </Pressable>
              );
            })}
            <CTA
              label={words("На главную", "Башкы бетке")}
              onPress={() => router.replace("/home")}
            />
          </>
        )}
        {step === "assign" && (
          <>
            <Copy size={30}>{t(locale, "assign")}</Copy>
            <Panel style={{ backgroundColor: theme.raised, gap: 7 }}>
              <Copy size={12} accent>
                {selected} / {t(locale, "simulation")}
              </Copy>
              <Copy size={23}>
                {selected === "CH3"
                  ? t(locale, "protected")
                  : words("Настроить прибор", "Түзмөктү жөндөө")}
              </Copy>
              <Copy muted>
                {selected === "CH3"
                  ? words(
                      "Для CH3 можно назначить изображение и название, но переключение и автоматизация запрещены.",
                      "CH3 үчүн ат жана сүрөт тандалат, башкарууга уруксат жок.",
                    )
                  : words(
                      "Укажите только физически поддерживаемое устройство этого канала.",
                      "Бул каналдын колдоосуна ылайык түзмөктү тандаңыз.",
                    )}
              </Copy>
            </Panel>
            <Copy muted>{words("Название устройства", "Түзмөктүн аты")}</Copy>
            <TextInput
              maxLength={80}
              accessibilityLabel={words("Название устройства", "Түзмөктүн аты")}
              value={draft.name}
              onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
              style={sty.field}
              placeholderTextColor={theme.dim}
              placeholder={words("Например: светильник", "Мисалы: чырак")}
            />
            <Copy size={16}>
              {words(
                "Категория и готовые изображения",
                "Категория жана даяр сүрөттөр",
              )}
            </Copy>
            <DeviceVisual assignment={draft} id={selected} scene style={{height:200,width:'100%',borderRadius:22}}/>
            <CTA secondary label={words('Каталог SVG и конструктор','SVG каталогу жана конструктор')} onPress={()=>router.push({pathname:'/catalog',params:{channel:selected,illustration:JSON.stringify(draft.appearance?.kind==='vector'?draft.appearance.config:defaultDeviceConfig(selected,draft.image))}})}/>
            <CTA secondary disabled={importing} label={importing?words('Импортируем…','Импорттолууда…'):words('Использовать свою фотографию','Өз сүрөтүмдү колдонуу')} onPress={choosePhoto}/>
            <Copy muted size={12}>{words('Выбор иллюстрации не меняет возможности канала.','Сүрөт тандоо каналдын мүмкүнчүлүгүн өзгөртпөйт.')}</Copy>
            <Copy size={15}>{t(locale, "room")}</Copy>
            <TextInput
              maxLength={80}
              accessibilityLabel={words("Помещение", "Бөлмө")}
              style={sty.field}
              value={draft.room}
              onChangeText={(room) => setDraft((d) => ({ ...d, room }))}
              placeholder={words("Например: кабинет", "Мисалы: кабинет")}
              placeholderTextColor={theme.dim}
            />
            <Panel style={{ gap: 10 }}>
              <View style={[sty.row, { justifyContent: "space-between" }]}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Copy size={17}>
                    {words("Разрешить автопилот", "Автопилотко уруксат")}
                  </Copy>
                  <Copy size={12} muted>
                    {selected === "CH3"
                      ? words(
                          "CH3 защищён · нельзя включить",
                          "CH3 корголгон · уруксат жок",
                        )
                      : words(
                          "Только после явного согласия",
                          "Ачык макулдуктан кийин гана",
                        )}
                  </Copy>
                </View>
                <Toggle
                  label={words(
                    "Разрешить автопилот",
                    "Автопилотко уруксат",
                  )}
                  value={selected !== "CH3" && draft.allowAuto}
                  disabled={selected === "CH3"}
                  onChange={(value) =>
                    setDraft((d) => ({ ...d, allowAuto: value }))
                  }
                />
              </View>
            </Panel>
            {!!error && (
              <Copy size={13} style={{ color: theme.error }}>
                {error}
              </Copy>
            )}
            <CTA label={t(locale, "finish")} onPress={save} />
          </>
        )}
        {step === "done" && (
          <>
            <Copy size={30}>{t(locale, "done")}</Copy>
            <DeviceVisual assignment={draft} id={selected} scene
              style={{ width: "100%", height: 235, borderRadius: 24 }}
            />
            <Panel style={{ gap: 6 }}>
              <Copy size={24}>{draft.name}</Copy>
              <Copy accent>{selected}</Copy>
              <Copy muted>
                {draft.room || "—"} ·{" "}
                {selected === "CH3"
                  ? t(locale, "protected")
                  : words(
                      draft.allowAuto
                        ? "Автопилот разрешён"
                        : "Автопилот не разрешён",
                      draft.allowAuto
                        ? "Автопилотко уруксат бар"
                        : "Автопилотко уруксат жок",
                    )}
              </Copy>
            </Panel>
            <CTA
              label={words("Другой канал", "Башка канал")}
              onPress={() => setStep("channels")}
            />
            <CTA
              secondary
              label={words("К устройствам", "Түзмөктөргө")}
              onPress={() => router.replace("/devices")}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
