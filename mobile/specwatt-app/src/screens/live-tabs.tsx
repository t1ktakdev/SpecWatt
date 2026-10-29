import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useLive, useLivePolling } from "../specwatt/live-context";
import { useSpec } from "../specwatt/store";
import { Shell, Header, Icon } from "../specwatt/mobile-ui";
import { DeviceVisual } from "../specwatt/device-visual";
import { Copy, Panel, CTA } from "../specwatt/ui";
import { theme } from "../specwatt/theme";
import { isSnapshotFresh, blocksNewCommands } from "../specwatt/server-request-scope";
import type { ServerChannel, ServerMeasurement } from "../specwatt/api";
import type { Assign, Locale } from "../specwatt/model";

export type LiveTab = "home" | "devices" | "journal" | "autopilot" | "plan" | "device";
const titles: Record<LiveTab,[string,string]> = {home:["Обзор энергии","Энергияга сереп"], devices:["Устройства","Түзмөктөр"], journal:["Журнал","Журнал"],autopilot:["Автопилот","Автопилот"],plan:["План","План"],device:["Канал контроллера","Контроллердин каналы"]};
const number = (value: number, locale: Locale) => value.toLocaleString(locale === "ky" ? "ky-KG" : "ru-RU",{maximumFractionDigits:1});
const stamp = (seconds: number, locale: Locale) => new Date(seconds*1000).toLocaleString(locale==="ky"?"ky-KG":"ru-RU",{hour:"2-digit",minute:"2-digit",second:"2-digit",day:"2-digit",month:"2-digit"});
export const commandStatus = (value: string, locale: Locale) => {
  const labels: Record<string,[string,string]>={requested:["Запрошена","Суралды"],sent:["Отправлена","Жөнөтүлдү"],acknowledged:["Подтверждена симулятором","Симулятор ырастады"],rejected:["Отклонена","Четке кагылды"],cancelled:["Отменена","Жокко чыгарылды"],timeout:["Тайм-аут · результат неизвестен","Тайм-аут · жыйынтык белгисиз"],"transport-error":["Ошибка передачи · результат неизвестен","Жөнөтүү катасы · жыйынтык белгисиз"],reconciled:["Сверена с телеметрией","Телеметрия менен текшерилди"]};
  return labels[value]?.[locale==="ky"?1:0]??value;
};
export function LiveTabScreen({tab}:{tab:LiveTab}) {
  const {workspace,state}=useLive(),{data,enterDemo}=useSpec();
  const locale=data.locale,w=(ru:string,ky:string)=>locale==="ky"?ky:ru;
  const [now,setNow]=useState(Date.now),[filter,setFilter]=useState("all");
  const {id}=useLocalSearchParams<{id:string}>();
  useLivePolling();
  useEffect(()=>{if(!state.snapshot)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[state.snapshot]);
  const snapshot=state.snapshot;
  const fresh=!state.error&&isSnapshotFresh(snapshot,now/1000);
  const waiting=state.uncertain||state.commands.some(c=>blocksNewCommands(c.status));
  const disabled=state.busy||state.refreshing||waiting||!fresh;
  const controller=state.controllers.find(c=>c.id===state.selectedId);
  return <Shell active={tab==="device"?"/devices":`/${tab}`} demoEvents={false}>
    <Header title={titles[tab][locale==="ky"?1:0]} subtitle="SpecWATT / Brain" onPress={()=>router.push("/server")}/>
    <View style={s.source} accessibilityLabel={w("Источник: серверная симуляция", "Булак: сервердик симуляция")}>
      <Icon name="pulse" size={17} color={theme.peach}/><Copy accent size={14}>{w("СЕРВЕР · СИМУЛЯЦИЯ", "СЕРВЕР · СИМУЛЯЦИЯ")}</Copy>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={w("Сменить контроллер", "Контроллерди алмаштыруу")} onPress={()=>router.push("/server")} style={s.controller}>
      <View style={{flex:1,gap:4}}><Copy size={19}>{controller?.name??w("Выберите контроллер", "Контроллерди тандаңыз")}</Copy><Copy muted size={14}>{fresh?w("Данные свежие", "Маалымат жаңы"):snapshot?w("Данные устарели или недоступны", "Маалымат эскирди же жеткиликсиз"):w("Нет актуального снимка", "Учурдагы маалымат жок")}</Copy></View><Icon name="next" size={20}/>
    </Pressable>
    {state.refreshing&&<ActivityIndicator accessibilityLabel={w("Обновление данных", "Маалымат жаңыртылууда")} color={theme.peach}/>}
    {!!state.error&&<Panel style={{gap:8,borderColor:theme.error}}><Copy accessibilityRole="alert" style={{color:theme.error}}>{errorText(state.error,locale)}</Copy><Copy muted size={14}>{state.error}</Copy></Panel>}
    {!state.client&&<Panel style={{gap:16}}><Copy size={21}>{w("Нужен вход на сервер", "Серверге кирүү керек")}</Copy><Copy muted>{w("Сеанс завершён. Данные предыдущего владельца удалены из этого пространства.", "Сеанс аяктады. Мурунку ээсинин маалыматы бул мейкиндиктен өчүрүлдү.")}</Copy><CTA label={w("Войти на сервер", "Серверге кирүү")} onPress={()=>router.push("/server")}/></Panel>}
    {state.client&&!state.selectedId&&<Panel style={{gap:16}}><Copy>{w("Сначала выберите свой контроллер", "Адегенде контроллерди тандаңыз")}</Copy><CTA label={w("Мои контроллеры", "Менин контроллерлорум")} onPress={()=>router.push("/server")}/></Panel>}
    {snapshot&&<>
      {(tab==="home"||tab==="device")&&<Panel style={{gap:12,padding:24,backgroundColor:theme.raised}}>
        <Copy muted size={14}>{tab==="device"?w("Мощность канала сейчас", "Каналдын учурдагы кубаты"):w("Мощность сейчас", "Учурдагы кубат")}</Copy>
        <View style={{flexDirection:"row",alignItems:"baseline",gap:8,flexWrap:"wrap"}}><Copy size={48} accent style={{fontWeight:"700"}}>{fresh?(tab==="device"?channelWatts(snapshot.channels.find(ch=>ch.id===id),locale):snapshot.total_watts===null?"—":number(snapshot.total_watts,locale)):"—"}</Copy><Copy size={22} muted>{w("Вт", "Вт")}</Copy></View>
        <Copy muted size={14}>{fresh?w("Образец симулятора", "Симулятордун үлгүсү"):w("Нет свежего измерения · управление отключено", "Жаңы өлчөө жок · башкаруу өчүрүлгөн")}</Copy>
        <Copy size={14}>{stamp(snapshot.measured_at,locale)} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</Copy>
        {tab==="home"&&<Copy muted size={14}>{w("Покрытие", "Камтуу")}: {fresh?snapshot.channels.filter(ch=>ch.watts!==null).length:0}/3 · {w("Предел", "Чек")} {number(snapshot.peak_watts,locale)} {w("Вт", "Вт")}</Copy>}
      </Panel>}
      {tab==="home"&&<PowerHistory rows={state.measurements} locale={locale}/>}
      {(tab==="home"||tab==="devices"||tab==="device")&&<>
        {tab==="home"&&<Copy size={21}>{w("Каналы контроллера", "Контроллердин каналдары")}</Copy>}
        {snapshot.channels.filter(ch=>tab!=="device"||ch.id===id).map(channel=><Panel key={channel.id} style={{gap:16}}>
          <View style={{flexDirection:"row",gap:16,alignItems:"center"}}>
            <DeviceVisual id={channel.id} assignment={assignment(channel)} style={{width:64,height:80,borderRadius:12,backgroundColor:theme.raised}}/>
            <View style={{flex:1,gap:4}}><Copy size={18}>{channel.assigned.name}</Copy><Copy muted size={14}>{channel.id} · {channel.assigned.room||w("Без комнаты", "Бөлмө жок")}</Copy><Copy accent size={21}>{fresh?channelWatts(channel,locale):"—"} {w("Вт", "Вт")}</Copy></View>
          </View>
          {channel.protected?<View style={s.source}><Icon name="shield" size={20} color={theme.peach}/><Copy size={14}>{w("CH3 защищён · только наблюдение", "CH3 корголгон · байкоо гана")}</Copy></View>:<>
            {tab!=="home"&&<CTA disabled={disabled} secondary label={`${channel.id} · ${(channel.watts??0)>0?w("Запросить выключение", "Өчүрүүнү суроо"):w("Запросить включение", "Күйгүзүүнү суроо")}`} onPress={()=>void workspace.command(channel.id,!(channel.watts!>0))}/>}
            {tab==="device"&&<><Copy muted>{w("Автоматизация требует отдельного разрешения владельца. Ручной приоритет проверяется сервером.", "Автоматташтыруу үчүн ээсинин өзүнчө уруксаты керек. Кол артыкчылыгын сервер текшерет.")}</Copy><CTA secondary disabled={state.busy||state.refreshing||waiting} label={channel.assigned.allow_auto?w("Запретить автоматизацию", "Автоматташтырууга тыюу салуу"):w("Разрешить автоматизацию", "Автоматташтырууга уруксат берүү")} onPress={()=>void workspace.consent(channel.id,!channel.assigned.allow_auto)}/></>}
          </>}
          {tab!=="device"&&<CTA secondary label={`${channel.id} · ${w("Подробнее", "Кененирээк")}`} onPress={()=>router.push(`/device?id=${channel.id}`)}/>}
        </Panel>)}
        {tab==="device"&&!snapshot.channels.some(ch=>ch.id===id)&&<Copy>{w("Канал не найден", "Канал табылган жок")}</Copy>}
      </>}
      {(tab==="home"||tab==="devices"||tab==="device"||tab==="journal")&&state.commands.length>0&&<>
        <Copy size={21}>{w("Последние команды", "Акыркы буйруктар")}</Copy>
        {state.commands.slice(0,tab==="journal"?100:2).map(command=><Panel key={command.id} style={{gap:8}}>
          <Copy>{command.channel_id} · {command.on?w("Включить", "Күйгүзүү"):w("Выключить", "Өчүрүү")}</Copy>
          <Copy accent accessibilityLiveRegion="polite">{commandStatus(command.status,locale)}</Copy>
          {command.transitions.map((transition,i)=><Copy key={i} muted size={14}>{commandStatus(transition.status,locale)} · {stamp(transition.at,locale)}</Copy>)}
          {!!command.reason&&<Copy muted size={14}>{errorText(command.reason,locale)}</Copy>}
          {tab==="journal"&&<Copy muted size={14} style={{flexShrink:1}}>{w("Корреляция", "Корреляция")}: {command.id}</Copy>}
        </Panel>)}
      </>}
      {tab==="journal"&&<>
        <Copy size={21}>{w("События сервера", "Сервердин окуялары")}</Copy>
        <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{[["all","Все","Баары"],["manual","Ручные","Кол менен"],["autopilot","Автопилот","Автопилот"],["errors","Ошибки","Каталар"]].map(([key,ru,ky])=><Pressable key={key} accessibilityRole="button" accessibilityState={{selected:filter===key}} style={[s.filter,filter===key&&{borderColor:theme.peach}]} onPress={()=>setFilter(key)}><Copy size={14}>{w(ru,ky)}</Copy></Pressable>)}</View>
        <Copy muted size={14}>{w("SIMULATOR · события по порядку получения. Время местное. Последние 500 записей.", "SIMULATOR · окуялар алуу тартибинде. Жергиликтүү убакыт. Акыркы 500 жазуу.")}</Copy>
        {state.events.filter(e=>eventMatches(e.kind,filter)).length===0&&<Panel><Copy muted>{w("Нет событий для этого фильтра", "Бул чыпкада окуя жок")}</Copy></Panel>}
        {[...state.events].reverse().filter(e=>eventMatches(e.kind,filter)).map(event=><Panel key={event.sequence} style={{gap:8}}><Copy>{eventTitle(event.kind,locale)}{event.channel_id?` · ${event.channel_id}`:""}</Copy><Copy muted size={14}>{stamp(event.created_at,locale)} · #{event.sequence} · SIMULATOR</Copy>{!!event.reason&&<Copy muted size={14}>{errorText(event.reason,locale)}</Copy>}{!!event.command_id&&<Copy muted size={14}>{event.command_id}</Copy>}</Panel>)}
        <CTA secondary disabled={state.refreshing} label={w("Загрузить следующие события", "Кийинки окуяларды жүктөө")} onPress={()=>void workspace.refresh()}/>
      </>}
      {(tab==="devices"||tab==="device")&&<Panel style={{gap:12,backgroundColor:theme.raised}}>
        <Copy size={20}>{w("Проверка симулятора", "Симуляторду текшерүү")}</Copy><Copy muted>{w("Запрос не меняет показания. Подтверждение создаёт только отдельный шаг серверного симулятора.", "Суроо көрсөткүчтү өзгөртпөйт. Сервердик симулятордун өзүнчө кадамы гана ырастайт.")}</Copy>
        <CTA disabled={state.busy||state.refreshing||state.uncertain||!state.commands.some(c=>c.status==="requested")} label={w("Симулировать подтверждение", "Ырастоону симуляциялоо")} onPress={()=>void workspace.step()}/>
        <CTA secondary disabled={state.busy||state.refreshing} label={w("Создать образец симулятора", "Симулятордун үлгүсүн түзүү")} onPress={()=>void workspace.sample()}/>
        <Copy muted size={14}>{w("Образец повторяет последние значения. Он не опрашивает ESP32 и не подтверждает команды.", "Үлгү акыркы маанилерди кайталайт. Ал ESP32ни сурамжылабайт жана буйруктарды ырастабайт.")}</Copy>
      </Panel>}
    </>}
    {state.uncertain&&<Panel style={{borderColor:theme.error,gap:8}}><Copy accessibilityRole="alert">{w("Результат запроса неизвестен", "Суроонун жыйынтыгы белгисиз")}</Copy><Copy muted>{w("Автоматического повтора нет. Сверьте историю команд через GET перед новым действием.", "Автоматтык кайталоо жок. Жаңы аракеттен мурда буйруктардын тарыхын GET аркылуу текшериңиз.")}</Copy></Panel>}
    {state.selectedId&&<CTA secondary disabled={state.busy||state.refreshing} label={w("Обновить данные сервера", "Сервердин маалыматын жаңыртуу")} onPress={()=>void workspace.refresh()}/>}
    <CTA secondary label={w("Перейти в DEMO", "DEMO режимине өтүү")} onPress={()=>{workspace.demo();enterDemo();router.replace("/home");}}/>
  </Shell>;
}
function assignment(ch:ServerChannel):Assign {
  const supported=["lamp","led-strip","fan","charger","socket","appliance"];
  const image=(supported.includes(ch.assigned.image)?ch.assigned.image:"appliance") as Assign["image"];
  return {name:ch.assigned.name,room:ch.assigned.room,image,category:image,allowAuto:ch.assigned.allow_auto};
}
function channelWatts(ch:ServerChannel|undefined,locale:Locale) {return ch?.watts===null||!ch?"—":number(ch.watts,locale);}
function eventMatches(kind:string,filter:string) {return filter==="all"||(filter==="errors"?/reject|timeout|error|fail/.test(kind):filter==="autopilot"?/schedule|auto/.test(kind):/command|manual/.test(kind));}
function eventTitle(kind:string,locale:Locale) {
  const labels:Record<string,[string,string]>={controller_created:["Контроллер создан","Контроллер түзүлдү"],telemetry:["Получен образец","Үлгү алынды"],command_requested:["Команда запрошена","Буйрук суралды"],command_sent:["Команда отправлена","Буйрук жөнөтүлдү"],command_acknowledged:["Подтверждение симулятора","Симулятордун ырастоосу"],command_rejected:["Команда отклонена","Буйрук четке кагылды"]};
  return labels[kind]?.[locale==="ky"?1:0]??kind;
}
function errorText(code:string,locale:Locale) {
  const w=(ru:string,ky:string)=>locale==="ky"?ky:ru;
  if(/401|session|authentication/.test(code))return w("Сеанс истёк. Войдите заново.", "Сеанс аяктады. Кайра кириңиз.");
  if(/network|timeout/.test(code))return w("Нет ответа сервера. Проверьте соединение; данные могут быть устаревшими.", "Серверден жооп жок. Байланышты текшериңиз; маалымат эски болушу мүмкүн.");
  const labels:Record<string,[string,string]>={stale_measurements:["Нет свежего измерения. Создайте образец симулятора явно.","Жаңы өлчөө жок. Симулятордун үлгүсүн түзүңүз."],protected_channel:["CH3 защищён. Управление запрещено.","CH3 корголгон. Башкарууга тыюу салынат."],peak_exceeded:["Запрос превысит допустимый пик.","Суроо уруксат берилген чокудан ашат."],invalid_response:["Ответ сервера нарушает контракт. Данные не приняты.","Сервердин жообу келишимге туура келбейт. Маалымат кабыл алынган жок."],controller_not_found:["Контроллер удалён или недоступен. Выберите другой.","Контроллер өчүрүлгөн же жеткиликсиз. Башкасын тандаңыз."],simulator_confirmed:["Подтверждено серверным симулятором","Сервердик симулятор ырастады"]};
  return labels[code]?.[locale==="ky"?1:0]??w("Сервер сообщил: ", "Сервер билдирди: ")+code;
}
function PowerHistory({rows,locale}:{rows:ServerMeasurement[];locale:Locale}) {
  const w=(ru:string,ky:string)=>locale==="ky"?ky:ru;
  const data=rows.slice(-30),start=data[0]?.measured_at??0,end=data.at(-1)?.measured_at??start;
  const points=data.map(row=>({t:row.measured_at,p:row.channels.CH1+row.channels.CH2+row.channels.CH3}));
  const peak=Math.max(1,...points.map(point=>point.p));
  const x=(t:number)=>12+(t-start)/Math.max(1,end-start)*256,y=(p:number)=>108-p/peak*88;
  const gap=points.some((point,i)=>i>0&&point.t-points[i-1].t>60);
  return <Panel style={{gap:12}}><Copy size={20}>{w("История мощности", "Кубаттын тарыхы")}</Copy><Copy muted size={14}>{w("Вт · образцы серверного симулятора", "Вт · сервердик симулятордун үлгүлөрү")}</Copy>
    {points.length<2?<Copy muted>{w("Нужно хотя бы два образца. История появится после явных действий симулятора.", "Кеминде эки үлгү керек. Тарых симулятордун аракеттеринен кийин чыгат.")}</Copy>:<>
      <Copy muted size={14}>{w("Пик в загруженной истории", "Жүктөлгөн тарыхтагы чоку")}: {number(peak,locale)} {w("Вт", "Вт")}</Copy>
      <View accessible accessibilityLabel={points.map(p=>`${stamp(p.t,locale)}: ${number(p.p,locale)} Вт`).join("; ")}>
        <Svg width="100%" height={128} viewBox="0 0 280 128" accessible={false}>
          <Line x1={12} x2={268} y1={108} y2={108} stroke={theme.line}/>
          {points.map((p,i)=><React.Fragment key={i}>{i>0&&p.t>points[i-1].t&&p.t-points[i-1].t<=60&&<Path d={`M${x(points[i-1].t)} ${y(points[i-1].p)} L${x(p.t)} ${y(p.p)}`} stroke={theme.peach} strokeWidth={2}/>}<Circle cx={x(p.t)} cy={y(p.p)} r={3} fill={theme.peach}/></React.Fragment>)}
        </Svg>
      </View><Copy muted size={14}>{stamp(start,locale)} → {stamp(end,locale)} · 0–{number(peak,locale)} {w("Вт", "Вт")}</Copy>
      {gap&&<Copy>{w("Есть разрывы более 60 с. Они не соединены.", "60 секунддан чоң үзгүлтүк бар. Алар бириктирилген жок.")}</Copy>}
    </>}
  </Panel>;
}
const s=StyleSheet.create({source:{flexDirection:"row",alignItems:"center",gap:8,flexWrap:"wrap"},controller:{minHeight:64,flexDirection:"row",alignItems:"center",gap:12,paddingVertical:8,borderBottomWidth:1,borderColor:theme.line},filter:{minHeight:48,paddingHorizontal:14,paddingVertical:12,borderRadius:24,borderWidth:1,borderColor:theme.line,justifyContent:"center"}});
