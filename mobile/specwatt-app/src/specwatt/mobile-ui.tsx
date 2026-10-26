import React from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  ViewStyle,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Path,
  Circle,
  Rect,
  Line,
  Text as SvgLabel,
} from "react-native-svg";
import { Copy } from "./ui";
import { theme } from "./theme";
import { useSpec } from "./store";

export type IconName =
  | "home"
  | "plug"
  | "pulse"
  | "calendar"
  | "journal"
  | "settings"
  | "back"
  | "next"
  | "power"
  | "bolt"
  | "shield"
  | "clock"
  | "plus"
  | "info"
  | "filter";
const paths: Record<IconName, string> = {
  home: "M3 10L12 3l9 7v11h-6v-7H9v7H3Z",
  plug: "M8 2v6m8-6v6M6 8h12v5a6 6 0 0 1-12 0ZM12 19v4",
  pulse: "M2 12h5l3-9 4 18 3-9h5",
  calendar: "M4 5h16v16H4ZM4 10h16M8 2v6m8-6v6",
  journal: "M6 2h9l4 4v16H6ZM14 2v6h5M9 12h7M9 16h7",
  settings: "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z",
  back: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  power: "M12 2v10M6 5a9 9 0 1 0 12 0",
  bolt: "M14 2L3 14h8l-1 8 11-12h-8Z",
  shield: "M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6ZM8 11l3 3 5-6",
  clock: "M12 6v7l5 3M3 3v6h6",
  plus: "M12 3v18M3 12h18",
  info: "M12 10v7M12 6v1",
  filter: "M2 3h20l-8 9v9l-4-2v-7Z",
};
export function Icon({
  name,
  size = 24,
  color = theme.muted,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.55}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {(name === "clock" || name === "info") && (
        <Circle cx={12} cy={12} r={10} />
      )}
      <Path d={paths[name]} />
      {name === "settings" && <Circle cx={12} cy={12} r={3.5} />}
    </Svg>
  );
}
export function CircleButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={s.circle}
    >
      <Icon name={icon} />
    </Pressable>
  );
}
export function useWords() {
  const { data } = useSpec();
  return (ru: string, ky: string) => (data.locale === "ky" ? ky : ru);
}
export function Shell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: string;
  header?: boolean;
}) {
  const { data, ready, storageError } = useSpec();
  const w = useWords();
  if (!ready)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Copy>{w("Загрузка…", "Жүктөлүүдө…")}</Copy>
      </View>
    );
  return (
    <LinearGradient
      colors={["#27251F", "#151815", "#141714", "#24231E"]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!!storageError && (
            <View accessibilityRole="alert" style={s.warning}>
              <Copy size={12}>
                {w(
                  "Не удалось сохранить настройки. Не закрывайте приложение.",
                  "Жөндөөлөр сакталган жок. Колдонмону жаппаңыз.",
                )}
              </Copy>
            </View>
          )}

          {data.events[0]?.kind === "error" && (
            <View accessibilityRole="alert" style={s.warning}>
              <Copy size={13}>
                {data.events[0].code === "peak-exceeded"
                  ? w(
                      "Команда отклонена: будет превышен допустимый пик.",
                      "Буйрук четке кагылды: уруксат берилген чокудан ашат.",
                    )
                  : w(
                      "Действие отклонено. Причина сохранена в журнале.",
                      "Аракет четке кагылды. Себеби журналга сакталды.",
                    )}
              </Copy>
            </View>
          )}
          {children}
        </ScrollView>
        <BottomNav active={active} />
      </SafeAreaView>
    </LinearGradient>
  );
}
const nav = [
  ["/home", "home", "Главная", "Башкы"],
  ["/devices", "plug", "Устройства", "Түзмөктөр"],
  ["/autopilot", "pulse", "Автопилот", "Автопилот"],
  ["/plan", "calendar", "План", "План"],
  ["/journal", "journal", "Журнал", "Журнал"],
] as const;
function BottomNav({ active }: { active?: string }) {
  const path = usePathname(),
    w = useWords();
  return (
    <View style={s.nav}>
      {nav.map(([href, icon, ru, ky]) => {
        const selected = (active || path) === href;
        return (
          <Pressable
            key={href}
            onPress={() => router.replace(href)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={w(ru, ky)}
            style={s.navItem}
          >
            <View
              style={[s.navIcon, selected && { backgroundColor: theme.peach }]}
            >
              <Icon
                name={icon}
                color={selected ? theme.ink : theme.dim}
                size={23}
              />
            </View>
            <Copy
              size={12}
              style={{
                fontSize: 10,
                color: selected ? theme.peach : theme.dim,
                textAlign: "center",
              }}
            >
              {w(ru, ky)}
            </Copy>
          </Pressable>
        );
      })}
    </View>
  );
}
export function Header({
  title,
  subtitle,
  icon = "settings",
  onPress,
}: {
  title: React.ReactNode;
  subtitle: string;
  icon?: IconName;
  onPress?: () => void;
}) {
  const w = useWords();
  return (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Copy size={28}>{title}</Copy>
        <Copy muted size={13}>
          {subtitle}
        </Copy>
      </View>
      <CircleButton
        icon={icon}
        label={
          icon === "plus"
            ? w("Добавить устройство", "Түзмөк кошуу")
            : icon === "back"
              ? w("Назад", "Артка")
              : icon === "filter"
                ? w("Фильтр", "Чыпка")
                : w("Настройки", "Жөндөөлөр")
        }
        onPress={onPress || (() => router.push("/settings"))}
      />
    </View>
  );
}
export function Brand() {
  return (
    <>
      Spec
      <Copy size={28} accent>
        WATT
      </Copy>
    </>
  );
}
export function Toggle({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: boolean;
  onChange: (x: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  if (Platform.OS === "web")
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        onPress={() => onChange(!value)}
        style={{
          minHeight: 44,
          minWidth: 64,
          justifyContent: "center",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <View
          style={{
            width: 61,
            height: 30,
            borderRadius: 18,
            backgroundColor: value ? theme.peach : "#3A3E3B",
            padding: 3,
            alignItems: value ? "flex-end" : "flex-start",
          }}
        >
          <View
            style={{
              height: 24,
              width: 24,
              borderRadius: 15,
              backgroundColor: "white",
            }}
          />
        </View>
      </Pressable>
    );
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ true: theme.peach, false: "#3A3E3B" }}
      thumbColor="#FFFFFF"
      style={{ opacity: disabled ? 0.45 : 1 }}
    />
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function RowLink({
  icon,
  title,
  subtitle,
  onPress,
  accent = false,
  right,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  accent?: boolean;
  right?: string;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.link}>
      <View style={[s.roundIcon, accent && { borderColor: theme.peach }]}>
        <Icon name={icon} size={26} color={accent ? theme.peach : theme.dim} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Copy size={15}>{title}</Copy>
        {subtitle && (
          <Copy size={12} muted>
            {subtitle}
          </Copy>
        )}
      </View>
      {right && <Copy size={16}>{right}</Copy>}
      <Icon size={18} name="next" />
    </Pressable>
  );
}
export function Chips({
  items,
  selected,
  onSelect,
}: {
  items: string[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {items.map((label, i) => (
        <Pressable
          key={label}
          onPress={() => onSelect(i)}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === i }}
          style={[
            s.chip,
            selected === i && {
              backgroundColor: theme.peach,
              borderColor: theme.peach,
            },
          ]}
        >
          <Copy
            size={13}
            style={{ color: selected === i ? theme.ink : theme.muted }}
          >
            {label}
          </Copy>
        </Pressable>
      ))}
    </View>
  );
}
export function Gauge({
  value,
  label,
  subtitle,
  bolt = false,
}: {
  value: string;
  label?: string;
  subtitle: string;
  bolt?: boolean;
}) {
  return (
    <View
      style={{
        height: 193,
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 7,
      }}
    >
      <Svg
        width="100%"
        height={185}
        viewBox="0 0 340 185"
        style={{ position: "absolute", top: 0 }}
      >
        <Path
          d="M28 153 A142 142 0 0 1 183 12"
          stroke="#484B43"
          strokeWidth={16}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M202 15 A142 142 0 0 1 238 31 M257 44 A142 142 0 0 1 286 76 M300 100 A142 142 0 0 1 312 153"
          stroke={theme.peach}
          strokeWidth={16}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      {bolt ? (
        <Icon name="bolt" size={43} color={theme.peach} />
      ) : (
        <Copy muted size={13}>
          {label}
        </Copy>
      )}
      <Copy size={bolt ? 33 : 57} style={{ marginTop: bolt ? 7 : 0 }}>
        {value}
      </Copy>
      <Copy size={13} muted>
        {subtitle}
      </Copy>
    </View>
  );
}
// Fixed demo history, explicitly labelled; current readings come from the store.
export function HistoryChart() {
  const w = useWords();
  const bars = [
    1.4, 1.8, 1.2, 1, 1.4, 0.9, 1, 1.3, 1.8, 2.4, 2.6, 3, 3.5, 3.1, 2.2, 2.7,
    3.6, 2.7, 3.6, 5, 5.4, 3.7, 1.3,
  ];
  return (
    <Card style={{ padding: 14, gap: 8 }}>
      <View style={s.between}>
        <Copy size={14}>{w("Нагрузка сегодня", "Бүгүнкү жүктөм")}</Copy>
        <Copy muted size={12}>
          {w("Вт · демо", "Вт · демо")}
        </Copy>
      </View>
      <Svg
        preserveAspectRatio="none"
        width="100%"
        height={83}
        viewBox="0 0 350 83"
      >
        {[0, 2, 4, 6].map((n) => (
          <React.Fragment key={n}>
            <Line
              x1={23}
              y1={68 - n * 10}
              x2={348}
              y2={68 - n * 10}
              stroke="#33362F"
            />
            <SvgText n={n} />
          </React.Fragment>
        ))}
        {bars.map((n, i) => (
          <Rect
            key={i}
            x={26 + i * 13.7}
            y={68 - n * 10}
            width={9}
            height={n * 10}
            rx={1.5}
            fill={i >= 16 && i <= 20 ? theme.peach : "#494D43"}
          />
        ))}
      </Svg>
      <View style={[s.between, { paddingLeft: 22 }]}>
        {["00", "04", "08", "12", "16", "20"].map((x) => (
          <Copy key={x} size={12} muted style={{ fontSize: 10 }}>
            {x}
          </Copy>
        ))}
      </View>
    </Card>
  );
}
function SvgText({ n }: { n: number }) {
  return (
    <SvgLabel x={2} y={71 - n * 10} fill={theme.dim} fontSize={9}>
      {n}
    </SvgLabel>
  );
}
export function ComparisonChart({
  before,
  after,
  labels,
}: {
  before: number[];
  after: number[];
  labels: string[];
}) {
  const w = useWords();
  const max = Math.max(9, ...before, ...after);
  return (
    <Card style={{ gap: 13 }}>
      <View style={s.between}>
        <Copy size={16}>{w("Почасовая нагрузка", "Сааттык жүктөм")}</Copy>
        <Copy muted size={12}>
          Вт
        </Copy>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={labels.length > 4}>
        <Svg
          width={Math.max(350, labels.length * 80 + 30)}
          height={180}
          viewBox={`0 0 ${Math.max(350, labels.length * 80 + 30)} 180`}
        >
          {[0, 3, 6, 9].map((v) => (
            <React.Fragment key={v}>
              <Line
                x1={20}
                x2={345}
                y1={155 - (v / max) * 130}
                y2={155 - (v / max) * 130}
                stroke="#353830"
              />
              <SvgLabel
                x={1}
                y={159 - (v / max) * 130}
                fill={theme.dim}
                fontSize={10}
              >
                {v}
              </SvgLabel>
            </React.Fragment>
          ))}
          {labels.map((label, i) => (
            <React.Fragment key={label}>
              {[before[i], after[i]].map((v, j) => (
                <React.Fragment key={j}>
                  <Rect
                    x={32 + i * 80 + j * 26}
                    y={155 - (v / max) * 130}
                    width={23}
                    height={(v / max) * 130}
                    rx={4}
                    fill={j ? theme.peach : "#54564B"}
                    stroke={j ? theme.peach : "#8B8C78"}
                  />
                  <SvgLabel
                    x={43 + i * 80 + j * 26}
                    y={149 - (v / max) * 130}
                    fontSize={10}
                    textAnchor="middle"
                    fill={j ? theme.peach : theme.muted}
                  >
                    {v.toFixed(1).replace(".", ",")}
                  </SvgLabel>
                </React.Fragment>
              ))}
              <SvgLabel
                x={58 + i * 80}
                y={177}
                fontSize={10}
                textAnchor="middle"
                fill={theme.muted}
              >
                {label}
              </SvgLabel>
            </React.Fragment>
          ))}
        </Svg>
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 22 }}>
        <Copy muted size={12}>
          ● {w("Без плана", "Плансыз")}
        </Copy>
        <Copy accent size={12}>
          ● {w("По плану", "План боюнча")}
        </Copy>
      </View>
    </Card>
  );
}
export function Empty() {
  const w = useWords();
  return (
    <Card style={{ gap: 15, marginTop: 35 }}>
      <Icon name="plug" size={38} color={theme.peach} />
      <Copy size={24}>
        {w("Нет подключённых каналов", "Туташкан каналдар жок")}
      </Copy>
      <Copy muted>
        {w(
          "Откройте демостенд или настройте контроллер. Измерения не подставляются.",
          "Демо стендди ачыңыз же контроллерди жөндөңүз. Өлчөөлөр кошулбайт.",
        )}
      </Copy>
      <Pressable onPress={() => router.push("/setup")} style={s.chip}>
        <Copy accent>{w("Подключение", "Туташтыруу")} →</Copy>
      </Pressable>
    </Card>
  );
}
export const formatW = (n: number | null) =>
  n === null ? "—" : n.toFixed(1).replace(".", ",");
export const s = StyleSheet.create({
  body: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 12,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 7,
  },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#22251F",
    borderWidth: 1,
    borderColor: "#3C4037",
    borderRadius: 19,
    padding: 15,
    overflow: "hidden",
  },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  nav: {
    marginHorizontal: 15,
    marginBottom: 6,
    paddingVertical: 9,
    paddingHorizontal: 7,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#3C4037",
    borderRadius: 25,
    backgroundColor: "#24261F",
    maxWidth: 542,
    width: "93%",
    alignSelf: "center",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    minHeight: 58,
    justifyContent: "center",
  },
  navIcon: {
    width: 41,
    height: 41,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  roundIcon: {
    width: 45,
    height: 45,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: "center",
    justifyContent: "center",
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    minHeight: 68,
    padding: 12,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#3C4037",
    backgroundColor: "#24261F",
  },
  chip: {
    flex: 1,
    minHeight: 39,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  warning: { padding: 12, backgroundColor: "#63382C", borderRadius: 12 },
});
