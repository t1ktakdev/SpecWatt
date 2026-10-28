import React,{useMemo,useState} from "react";
import { createDemoHistory,integratePower } from "./energy";
import type { ChannelId } from "./model";
import Animated from "react-native-reanimated";
import { MotionPressable as Pressable, Reveal, AnimatedSelection, TracePath, ChartBar, useToggleMotion } from "./motion";
import { normalizedPower } from "./motion-tokens";
import {
  View,
  ScrollView,
  StyleSheet,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Path,
  Circle,
  Line,
  Text as SvgLabel,
} from "react-native-svg";
import { Copy } from "./ui";
import { theme } from "./theme";
import { chartScale, chartValue } from "./chart-layout";
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
  const { width } = useWindowDimensions();
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
      colors={["#24241F", theme.bg, theme.bg, "#20211D"]}
      locations={[0,.25,.8,1]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={[s.body, {paddingHorizontal: width < 360 ? 16 : 20}]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Reveal style={{gap:16}}>
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
          </Reveal>
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
            <AnimatedSelection selected={selected} style={s.navIcon}>
              <Icon
                name={icon}
                color={selected ? theme.ink : theme.dim}
                size={23}
              />
            </AnimatedSelection>
            <Copy
              size={12}
              style={{
                fontSize: 12,
                lineHeight: 16,
                maxWidth: "100%",
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
export function Toggle({value,onChange,label,disabled=false}:{value:boolean;onChange:(value:boolean)=>void;label:string;disabled?:boolean}){
 const {thumb}=useToggleMotion(value);
 return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{checked:value,disabled}} disabled={disabled} onPress={event=>{event.stopPropagation();onChange(!value);}} style={{height:48,width:64,justifyContent:'center',opacity:disabled?.45:1}}>
  <View style={{width:62,height:31,borderRadius:18,backgroundColor:value?theme.peach:'#3A3E3B',padding:3,borderWidth:1,borderColor:value?'#B4804F':'#494C46'}}>
   <Animated.View style={[{height:23,width:23,borderRadius:13,backgroundColor:'#FFFFFF'},thumb]}/>
  </View>
 </Pressable>;
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
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Copy size={15}>{title}</Copy>
        {subtitle && (
          <Copy size={12} muted>
            {subtitle}
          </Copy>
        )}
      </View>
      {right && <Copy size={16} style={{maxWidth: "30%", textAlign: "right"}}>{right}</Copy>}
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
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
            style={{ color: selected === i ? theme.ink : theme.muted, textAlign: "center" }}
          >
            {label}
          </Copy>
        </Pressable>
      ))}
    </View>
  );
}
export function Gauge({value,label,subtitle,bolt=false,power,limit=7}:{value:string;label?:string;subtitle:string;bolt?:boolean;power?:number|null;limit?:number}){
 const {fontScale,width}=useWindowDimensions();
 const ratio=normalizedPower(power??null,limit);
 const end=ratio??0;
 const x=170-142*Math.cos(Math.PI*end),y=153-142*Math.sin(Math.PI*end);
 return <View style={{minHeight:220*fontScale,justifyContent:'flex-end',alignItems:'center',paddingTop:72,paddingBottom:12,gap:4}}>
  <Svg width="100%" height={Math.min(width-40,360)*.56} viewBox="0 0 340 180" style={{position:'absolute',top:0}} accessible={false}>
   <Path d="M28 153 A142 142 0 0 1 312 153" stroke={theme.line} strokeWidth={11} strokeLinecap="round" fill="none"/>
   {end>0&&<TracePath d={`M28 153 A142 142 0 0 1 ${x} ${y}`} progress={1} length={end*446.2} stroke={theme.peach} strokeWidth={11} strokeLinecap="round" fill="none"/>}
  </Svg>
  {bolt?<Icon name="bolt" size={32} color={theme.peach}/>:<Copy muted size={13}>{label}</Copy>}
  <Copy size={width<360?44:52} style={{textAlign:'center'}}>{value}</Copy>
  <Copy size={13} muted style={{textAlign:'center'}}>{subtitle}</Copy>
 </View>;
}
export function HistoryChart({channelId}:{channelId?:ChannelId}={}) {
 const {data}=useSpec(),w=useWords();
 const [details,setDetails]=useState(false),[width,setWidth]=useState(320);
 const history=useMemo(()=>data.source==='demo'&&data.channels.length===3?createDemoHistory(data.channels):null,[data.source,data.channels]);
 if(!history)return <Card><Copy muted>{w('История измерений пока недоступна','Өлчөөлөрдүн тарыхы азырынча жок')}</Copy></Card>;
 const samples=channelId?history.byChannel[channelId]:history.samples;
 const summary=channelId?integratePower(samples,{maxGapMs:3600000}):history.summary;
 const bars=samples.slice(0,-1),{max,ticks}=chartScale(bars.map(s=>s.freshness==='fresh'?s.watts:null));
 const left=28,right=width-4,baseline=100,plot=80,step=(right-left)/Math.max(1,bars.length);
 const label=(at:number)=>new Date(at).toLocaleTimeString(data.locale==='ky'?'ky-KG':'ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bishkek'});
 const summaryText=`${w('Демо · 12 ч','Демо · 12 саат')} · ${summary.complete?summary.observedWh.toFixed(1).replace('.',','):'—'} Wh · ${w('Пик','Чоку')} ${formatW(summary.peakW)} Вт`;
 return <Card style={{gap:8}}>
  <View style={s.between}><Copy size={15} style={{flex:1}}>{w('Нагрузка сегодня','Бүгүнкү жүктөм')}</Copy><Pressable accessibilityRole="button" accessibilityLabel={w('Показать энергию и пик','Энергия менен чокуну көрсөтүү')} accessibilityState={{expanded:details}} onPress={()=>setDetails(!details)} style={{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'}}><Icon name="info" size={20}/></Pressable></View>
  <View onLayout={event=>setWidth(event.nativeEvent.layout.width)}>
   <Svg width={width} height={132} viewBox={`0 0 ${width} 132`} accessibilityLabel={summaryText}>
    {ticks.map(n=><React.Fragment key={n}><Line x1={left} x2={right} y1={baseline-n/max*plot} y2={baseline-n/max*plot} stroke={theme.line}/><SvgLabel x={0} y={baseline-n/max*plot+4} fill={theme.muted} fontSize={12}>{Number(n.toFixed(1))}</SvgLabel></React.Fragment>)}
    {bars.map((sample,i)=>{const value=sample.freshness==='fresh'?chartValue(sample.watts):null;return value!==null?<ChartBar key={sample.at} x={left+i*step+1} width={Math.max(1,step-3)} height={value/max*plot} baseline={baseline} rx={2} fill={i>=bars.length-7&&i<bars.length-2?theme.peach:'#777C6C'}/>:null;})}
    {[0,6,12,18,24].map((i,j)=><SvgLabel key={i} x={left+(right-left)*j/4} y={124} textAnchor={j===0?'start':j===4?'end':'middle'} fill={theme.muted} fontSize={12}>{label(samples[i].at)}</SvgLabel>)}
   </Svg>
  </View>
  <Copy size={12} muted>{details?summaryText:w('Вт · модельная история, не измерения','Вт · үлгү тарых, өлчөөлөр эмес')}</Copy>
 </Card>;
}
export function ComparisonChart({before,after,labels}:{before:(number|null)[];after:(number|null)[];labels:string[]}) {
 const w=useWords(),[available,setAvailable]=useState(320);
 const {max,ticks}=chartScale([...before,...after]);
 const width=Math.max(available,labels.length*96+40),left=32,baseline=156,plot=124,step=(width-left-8)/Math.max(labels.length,1);
 const summary=labels.map((label,i)=>`${label}: ${formatW(chartValue(before[i]))} → ${formatW(chartValue(after[i]))} Вт`).join('; ');
 return <Card style={{gap:12}}>
  <View style={s.between}><Copy size={16} style={{flex:1}}>{w('Почасовая нагрузка','Сааттык жүктөм')}</Copy><Copy muted size={12}>Вт</Copy></View>
  <ScrollView horizontal showsHorizontalScrollIndicator onLayout={event=>setAvailable(event.nativeEvent.layout.width)}>
   <Svg width={width} height={190} viewBox={`0 0 ${width} 190`} accessibilityLabel={summary}>
    {ticks.map(v=><React.Fragment key={v}><Line x1={left} x2={width-8} y1={baseline-v/max*plot} y2={baseline-v/max*plot} stroke={theme.line}/><SvgLabel x={0} y={baseline-v/max*plot+4} fill={theme.muted} fontSize={12}>{Number(v.toFixed(1))}</SvgLabel></React.Fragment>)}
    {labels.map((label,i)=><React.Fragment key={`${label}-${i}`}>
     {[before[i],after[i]].map((raw,j)=>{const v=chartValue(raw),x=left+i*step+step/2-28+j*28;return <React.Fragment key={j}>
      {v!==null&&<ChartBar baseline={baseline} x={x} width={24} height={v/max*plot} rx={4} fill={j?theme.peach:'#777C6C'}/>}
      <SvgLabel x={x+12} y={v===null?baseline-6:baseline-v/max*plot-8} fontSize={12} textAnchor="middle" fill={j?theme.peach:theme.muted}>{formatW(v)}</SvgLabel>
     </React.Fragment>;})}
     <SvgLabel x={left+i*step+step/2} y={180} fontSize={12} textAnchor="middle" fill={theme.muted}>{label}</SvgLabel>
    </React.Fragment>)}
   </Svg>
  </ScrollView>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:16}}><Copy muted size={13}>● {w('Без плана','Плансыз')}</Copy><Copy accent size={13}>● {w('По плану','План боюнча')}</Copy></View>
  <Copy size={12} muted>{summary||w('Нет данных для сравнения','Салыштыруу үчүн маалымат жок')}</Copy>
 </Card>;
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
  n === null ? "—" : n===0?"0":n.toFixed(1).replace(".", ",");
export const s = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    gap: 12,
    width: "100%",
    maxWidth: 440,
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
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: theme.r.card,
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
    marginHorizontal: 0,
    marginBottom: 6,
    paddingVertical: 9,
    paddingHorizontal: 2,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 26,
    backgroundColor: "#242522",
    maxWidth: 408,
    width: "92%",
    alignSelf: "center",
  },
  navItem: {
    flex: 1,
    minWidth: 0,
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
    borderRadius: theme.r.card,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.surface,
  },
  chip: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 10,
    minWidth: 80,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  warning: { padding: 12, backgroundColor: "#63382C", borderRadius: 12 },
});
