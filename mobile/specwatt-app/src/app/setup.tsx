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
import { defaultDraft } from "../specwatt/localization/default-draft";
type Step = "overview" | "channels" | "assign" | "done";
export default function Setup() {
  const { data, enterDemo, assign } = useSpec();
  const locale = data.locale;
  const params=useLocalSearchParams<{channel?:string;illustration?:string}>();
  const consumed=useRef('');
  const [importing,setImporting]=useState(false);

  const [step, setStep] = useState<Step>("overview");
  const [selected, setSelected] = useState<ChannelId>("CH1");
  const [draft, setDraft] = useState<Assign>(() => defaultDraft(locale));
  const [error, setError] = useState("");
  useFocusEffect(useCallback(()=>{
   if(!params.channel||!['CH1','CH2','CH3'].includes(params.channel)||!params.illustration)return;
   const key=params.channel+params.illustration;if(consumed.current===key)return;consumed.current=key;
   try{const config=validateIllustrationConfig(JSON.parse(params.illustration));if(!config)return;const id=params.channel as ChannelId;setSelected(id);setDraft(d=>({...d,appearance:{kind:'vector',config}}));setStep('assign');}catch{}
  },[params.channel,params.illustration]));
  function pickChannel(ch: ChannelId) {
    const channel = data.channels.find((c) => c.id === ch);
    setSelected(ch);
    setDraft(channel?.assigned || defaultDraft(locale));
    setError("");
    setStep("assign");
  }
  function save() {
    if (
      !draft.name.trim() ||
      draft.name.length > 80 ||
      draft.room.length > 80
    ) {
      setError(t(locale, "errName"));
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
    catch{setError(t(locale,'errPhoto'));}
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
              {t(locale, "setupTitle")}
            </Copy>
            <Panel style={{ backgroundColor: theme.raised, gap: 9 }}>
              <Copy size={12} accent>
                {t(locale, "lowVoltageBadge")}
              </Copy>
              <Copy size={26}>
                {t(locale, "controllerChannels")}
              </Copy>
              <Copy muted>
                {t(locale, "discoveryNote")}
              </Copy>
            </Panel>
            <Copy size={16}>
              {t(locale, "whatAvailable")}
            </Copy>
            <View style={sty.card}>
              <Copy>CH1 / CH2</Copy>
              <Copy muted>
                {t(locale, "assignNote")}
              </Copy>
            </View>
            <View style={sty.card}>
              <Copy accent>CH3 · {t(locale, "protected")}</Copy>
              <Copy muted>
                {t(locale, "ch3Note")}
              </Copy>
            </View>
            <CTA
              label={
                data.source === "demo"
                  ? t(locale, "configureCurrent")
                  : t(locale, "openSimulation")
              }
              onPress={() => {
                if (data.source !== "demo") enterDemo();
                setStep("channels");
              }}
            />
            <CTA
              secondary
              label={t(locale, "empty")}
              onPress={() => router.replace("/home")}
            />
          </>
        )}
        {step === "channels" && (
          <>
            <Copy size={31}>{t(locale, "channels")}</Copy>
            <Copy muted>
              {t(locale, "simulation")} ·{" "}
              {t(locale, "virtualChannelsNote")}
            </Copy>
            {(["CH1", "CH2", "CH3"] as ChannelId[]).map((id) => {
              const ch = data.channels.find((c) => c.id === id),
                value = ch?.assigned;
              return (
                <Pressable
                  key={id}
                  onPress={() => pickChannel(id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${id} · ${value?.name || t(locale, "unassigned")}`}
                  accessibilityHint={id === "CH3" ? t(locale, "protected") : t(locale, "assignTune")}
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
                      {value?.name || t(locale, "unassigned")}
                    </Copy>
                    <Copy muted>
                      {id === "CH3"
                        ? t(locale, "protected")
                        : t(locale, "assignTune")}
                    </Copy>
                  </View>
                  <DeviceVisual assignment={value} id={id}
                    style={{ width: 105, height: 103, borderRadius: 16 }}
                  />
                </Pressable>
              );
            })}
            <CTA
              label={t(locale, "toHome")}
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
                  : t(locale, "configureDevice")}
              </Copy>
              <Copy muted>
                {selected === "CH3"
                  ? t(locale, "ch3AssignNote")
                  : t(locale, "supportedDeviceNote")}
              </Copy>
            </Panel>
            <Copy muted>{t(locale, "deviceName")}</Copy>
            <TextInput
              maxLength={80}
              accessibilityLabel={t(locale, "deviceName")}
              value={draft.name}
              onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
              style={sty.field}
              placeholderTextColor={theme.dim}
              placeholder={t(locale, "namePlaceholder")}
            />
            <Copy size={16}>
              {t(locale, "categoryImages")}
            </Copy>
            <DeviceVisual assignment={draft} id={selected} scene style={{height:200,width:'100%',borderRadius:22}}/>
            <CTA secondary label={t(locale,'svgCatalog')} onPress={()=>router.push({pathname:'/catalog',params:{channel:selected,illustration:JSON.stringify(draft.appearance?.kind==='vector'?draft.appearance.config:defaultDeviceConfig(selected,draft.image))}})}/>
            <CTA secondary disabled={importing} label={importing?t(locale,'importing'):t(locale,'useOwnPhoto')} onPress={choosePhoto}/>
            <Copy muted size={12}>{t(locale,'illustrationNote')}</Copy>
            <Copy size={15}>{t(locale, "room")}</Copy>
            <TextInput
              maxLength={80}
              accessibilityLabel={t(locale, "room")}
              style={sty.field}
              value={draft.room}
              onChangeText={(room) => setDraft((d) => ({ ...d, room }))}
              placeholder={t(locale, "roomPlaceholder")}
              placeholderTextColor={theme.dim}
            />
            <Panel style={{ gap: 10 }}>
              <View style={[sty.row, { justifyContent: "space-between" }]}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Copy size={17}>
                    {t(locale, "allowAuto")}
                  </Copy>
                  <Copy size={12} muted>
                    {selected === "CH3"
                      ? t(locale, "ch3Blocked")
                      : t(locale, "consentNote")}
                  </Copy>
                </View>
                <Toggle
                  label={t(locale, "allowAuto")}
                  value={selected !== "CH3" && draft.allowAuto}
                  disabled={selected === "CH3"}
                  onChange={(value) =>
                    setDraft((d) => ({ ...d, allowAuto: value }))
                  }
                />
              </View>
            </Panel>
            {!!error && (
              <Copy size={13} accessibilityLiveRegion="polite" style={{ color: theme.error }}>
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
                  : t(locale, draft.allowAuto ? "autoAllowed" : "autoDenied")}
              </Copy>
            </Panel>
            <CTA
              label={t(locale, "anotherChannel")}
              onPress={() => setStep("channels")}
            />
            <CTA
              secondary
              label={t(locale, "toDevices")}
              onPress={() => router.replace("/devices")}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
