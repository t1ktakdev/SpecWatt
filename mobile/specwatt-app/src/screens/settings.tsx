import {clearDevicePhotos} from "../specwatt/photos";
import { MotionPressable as Pressable } from '../specwatt/motion';
import React, { useState } from "react";
import { View, TextInput, Share } from "react-native";
import { router } from "expo-router";
import { Copy, CTA } from "../specwatt/ui";
import { useSpec } from "../specwatt/store";
import { t } from "../specwatt/i18n";
import { applyLocale } from "../specwatt/localization/locale-mirror";
import { theme, sty } from "../specwatt/theme";
import {
  Shell,
  Header,
  Card,
  RowLink,
  s,
} from "../specwatt/mobile-ui";

export function SettingsScreen() {
  const { data, setLocale, setPeak, setManualMinutes, leaveDemo } = useSpec();
  const locale = data.locale;
  const [peak, setPeakInput] = useState(String(data.peak));
  const [hold, setHold] = useState(String(data.manualMinutes));
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [legal, setLegal] = useState(false);
  function save() {
    const p = Number(peak.replace(",", ".")),
      m = Number(hold);
    if (
      !Number.isFinite(p) ||
      p < 1 ||
      p > 100 ||
      !Number.isInteger(m) ||
      m < 1 ||
      m > 240
    ) {
      setMessage(t(locale, "errLimits"));
      return;
    }
    setPeak(p);
    setManualMinutes(m);
    setMessage(t(locale, "saved"));
  }
  return (
    <Shell active="/home">
      <Header
        title={t(locale, "settingsTitle")}
        subtitle={t(locale, "localSpace")}
        icon="back"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/home")
        }
      />
      <Card style={{ gap: 14 }}>
        <Copy size={20}>{t(locale, "language")}</Copy>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {(["ru", "ky"] as const).map((l) => (
            <Pressable
              key={l}
              accessibilityRole="button"
              accessibilityLabel={l === "ru" ? t(locale, "langRu") : t(locale, "langKy")}
              accessibilityHint={t(locale, "langHint")}
              accessibilityState={{ selected: data.locale === l }}
              onPress={() => applyLocale(setLocale, l)}
              style={[
                s.chip,
                data.locale === l && { borderColor: theme.peach },
              ]}
            >
              <Copy accent={data.locale === l}>
                {l === "ru" ? t(locale, "langRu") : t(locale, "langKy")}
              </Copy>
            </Pressable>
          ))}
        </View>
      </Card>
      <Card style={{ gap: 10 }}>
        <Copy size={20}>
          {t(locale, "safeCoordination")}
        </Copy>
        <Copy muted size={13}>
          {t(locale, "peakW")}
        </Copy>
        <TextInput
          accessibilityLabel={t(locale, "peakA11y")}
          value={peak}
          onChangeText={setPeakInput}
          style={sty.field}
          keyboardType="decimal-pad"
        />
        <Copy muted size={13}>
          {t(locale, "holdMinutes")}
        </Copy>
        <TextInput
          accessibilityLabel={t(locale, "holdA11y")}
          value={hold}
          onChangeText={setHold}
          style={sty.field}
          keyboardType="number-pad"
        />
        <CTA
          label={t(locale, "saveLimits")}
          disabled={data.source !== "demo"}
          onPress={save}
        />
        {!!message && (
          <Copy accessibilityLiveRegion="polite" muted>
            {message}
          </Copy>
        )}
      </Card>
      <RowLink icon="plug" title={t(locale, "svgCatalogTitle")} subtitle={t(locale, "svgCatalogSub")} onPress={()=>router.push("/catalog")}/>
      <RowLink
        icon="plug"
        title={t(locale, "controllerPerms")}
        onPress={() => router.push("/setup")}
      />
      <RowLink
        icon="pulse"
        title={t(locale, "serverSimulator")}
        subtitle={t(locale, "serverSimSub")}
        onPress={() => router.push("/server")}
      />
      <RowLink
        icon="journal"
        title={t(locale, "exportDemo")}
        subtitle={t(locale, "exportSub")}
        onPress={() => {
          Share.share({
            message: JSON.stringify(
              { schema: 1, source: "demo", data },
              null,
              2,
            ),
          }).catch(() =>
            setMessage(t(locale, "errExport")),
          );
        }}
      />
      <RowLink
        icon="info"
        title={t(locale, "privacy")}
        subtitle={t(locale, "privacySub")}
        onPress={() => setLegal(!legal)}
      />
      {legal && (
        <Card style={{ gap: 12 }}>
          <Copy size={19}>
            {t(locale, "legalDraft")}
          </Copy>
          <Copy>
            {t(locale, "legal1")}
          </Copy>
          <Copy>
            {t(locale, "legal2")}
          </Copy>
          <Copy>
            {t(locale, "legal3")}
          </Copy>
          <Copy muted size={12}>
            {t(locale, "legalNote")}
          </Copy>
        </Card>
      )}
      <Card style={{ gap: 10 }}>
        <Copy size={17}>SpecWATT · 0.2.0</Copy>
        <Copy size={12} muted>
          {t(locale, "versionNote")}
        </Copy>
        <CTA
          secondary
          label={t(locale, "clearDemo")}
          onPress={() => setConfirm(true)}
        />
        {confirm && (
          <>
            <Copy>
              {t(locale, "clearConfirm")}
            </Copy>
            <CTA
              label={t(locale, "deleteDemo")}
              onPress={() => {
                try{clearDevicePhotos();}catch{}
                      leaveDemo();
                router.replace("/home");
              }}
            />
            <CTA
              secondary
              label={t(locale, "cancel")}
              onPress={() => setConfirm(false)}
            />
          </>
        )}
      </Card>
    </Shell>
  );
}
