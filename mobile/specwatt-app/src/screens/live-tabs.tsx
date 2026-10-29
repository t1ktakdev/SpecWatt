import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
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
import {MotionPressable as Pressable} from "../specwatt/motion";
import {Details, ConsentControl} from "./live-controls";
import ServerSchedules from "./server-schedules";
import { serverPowerHistory, powerChartRange } from "../specwatt/live-history";

export type LiveTab = "home" | "devices" | "journal" | "autopilot" | "plan" | "device";
const titles: Record<LiveTab,[string,string]> = {home:["Обзор энергии","Энергияга сереп"], devices:["Устройства","Түзмөктөр"], journal:["Журнал","Журнал"],autopilot:["Автопилот","Автопилот"],plan:["План нагрузки","Жүк планы"],device:["Канал контроллера","Контроллердин каналы"]};
const number = (value: number, locale: Locale) => value.toLocaleString(locale === "ky" ? "ky-KG" : "ru-RU",{maximumFractionDigits:1});
const stamp = (seconds: number, locale: Locale) => new Date(seconds*1000).toLocaleString(locale==="ky"?"ky-KG":"ru-RU",{hour:"2-digit",minute:"2-digit",second:"2-digit",day:"2-digit",month:"2-digit"});
export const commandStatus = (value: string, locale: Locale) => {
  const labels: Record<string,[string,string]>={requested:["Запрошена","Суралды"],sent:["Отправлена","Жөнөтүлдү"],acknowledged:["Подтверждена симулятором","Симулятор ырастады"],rejected:["Отклонена","Четке кагылды"],cancelled:["Отменена","Жокко чыгарылды"],timeout:["Тайм-аут · результат неизвестен","Тайм-аут · жыйынтык белгисиз"],"transport-error":["Ошибка передачи · результат неизвестен","Жөнөтүү катасы · жыйынтык белгисиз"],reconciled:["Сверена с телеметрией","Телеметрия менен текшерилди"]};
  return labels[value]?.[locale==="ky"?1:0]??value;
};
export function LiveTabScreen({tab}:{tab:LiveTab}) {
  const {workspace,state}=useLive(),{data,enterDemo}=useSpec();
  const locale=data.locale,w=(ru:string,ky:string)=>locale==="ky"?ky:ru;
  const [now,setNow]=useState(Date.now),[filter,setFilter]=useState("all"),[deviceFilter,setDeviceFilter]=useState("all"),[eventLimit,setEventLimit]=useState(20);
  const {id,channel:plannedChannel}=useLocalSearchParams<{id:string;channel:string}>();
  const scheduler=useMemo(()=>state.client?.scheduler()??null,[state.client]);
  useLivePolling();
  useEffect(()=>{if(!state.snapshot)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[state.snapshot]);
  const snapshot=state.snapshot;
  const fresh=!state.error&&isSnapshotFresh(snapshot,now/1000);
  const waiting=state.uncertain||state.commands.some(c=>blocksNewCommands(c.status));
  const disabled=state.busy||state.refreshing||waiting||!fresh;
  const controller=state.controllers.find(c=>c.id===state.selectedId);
  return <Shell active={tab==="device"?"/devices":`/${tab}`} demoEvents={false}>
    <Header title={titles[tab][locale==="ky"?1:0]} subtitle={tab==="device"?w("Устройства / канал", "Түзмөктөр / канал"):"SpecWATT"} icon={tab==="device"?"back":"settings"} onPress={()=>tab==="device"?router.replace("/devices"):router.push("/server")}/>
    <View style={[s.source,s.badge]} accessibilityLabel={w("Источник: серверная симуляция", "Булак: сервердик симуляция")}>
      <Icon name="pulse" size={17} color={theme.peach}/><Copy accent size={12}>{w("СЕРВЕР · СИМУЛЯЦИЯ", "СЕРВЕР · СИМУЛЯЦИЯ")}</Copy>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={w("Сменить контроллер", "Контроллерди алмаштыруу")} onPress={()=>router.push("/server")} style={s.controller}>
      <View style={{flex:1,gap:4}}><Copy size={17} style={{fontWeight:"700"}}>{controller?.name??w("Выберите контроллер", "Контроллерди тандаңыз")}</Copy><Copy muted size={14}>{fresh?w("Данные свежие", "Маалымат жаңы"):snapshot?w("Данные устарели или недоступны", "Маалымат эскирди же жеткиликсиз"):w("Нет актуального снимка", "Учурдагы маалымат жок")}</Copy></View><Icon name="next" size={20}/>
    </Pressable>
    {state.refreshing&&<ActivityIndicator accessibilityLabel={w("Обновление данных", "Маалымат жаңыртылууда")} color={theme.peach}/>}
    {!!state.error&&<Panel style={{gap:8,borderColor:theme.error}}><Copy accessibilityRole="alert" style={{color:theme.error}}>{errorText(state.error,locale)}</Copy><Details label={w("Технические сведения", "Техникалык маалымат")}><Copy muted size={14}>{state.error}</Copy></Details></Panel>}
    {!state.client&&<Panel style={{gap:16}}><Copy size={21}>{w("Нужен вход на сервер", "Серверге кирүү керек")}</Copy><Copy muted>{w("Сеанс завершён. Данные предыдущего владельца удалены из этого пространства.", "Сеанс аяктады. Мурунку ээсинин маалыматы бул мейкиндиктен өчүрүлдү.")}</Copy><CTA label={w("Войти на сервер", "Серверге кирүү")} onPress={()=>router.push("/server")}/></Panel>}
    {state.client&&!state.selectedId&&<Panel style={{gap:16}}><Copy>{w("Сначала выберите свой контроллер", "Адегенде контроллерди тандаңыз")}</Copy><CTA label={w("Мои контроллеры", "Менин контроллерлорум")} onPress={()=>router.push("/server")}/></Panel>}
    {snapshot&&<>
      {(waiting||!fresh)&&<Panel style={{gap:12,borderColor:theme.peach}}>
        <View style={s.source}><Icon name={waiting?"clock":"info"} size={20} color={theme.peach}/><Copy accessibilityLiveRegion="polite" size={18} style={{flex:1}}>{state.uncertain?w("Результат запроса неизвестен", "Суроонун жыйынтыгы белгисиз"):waiting?w("Ожидаем результат команды", "Буйруктун жыйынтыгын күтүүдө"):w("Нужен свежий образец", "Жаңы үлгү керек")}</Copy></View>
        <Copy muted>{state.uncertain?w("Ответ потерян. Обновите историю перед новым действием; повторной отправки нет.", "Жооп жоголду. Жаңы аракеттен мурда тарыхты жаңыртыңыз; кайра жөнөтүлбөйт."):waiting?w("Запрос записан. Мощность изменится только после подтверждения симулятора.", "Суроо жазылды. Кубат симулятордун ырастоосунан кийин гана өзгөрөт."):w("Чтение сервера не создаёт измерения. Явно создайте образец с последними значениями симулятора.", "Серверди окуу өлчөө түзбөйт. Симулятордун акыркы маанилери менен үлгүнү түзүңүз.")}</Copy>
        {state.commands.some(c=>c.status==="requested")&&!state.uncertain?<CTA disabled={state.busy||state.refreshing||!!state.error} label={w("Выполнить шаг симулятора", "Симулятордун кадамын аткаруу")} onPress={()=>void workspace.step()}/>:!waiting&&<CTA secondary disabled={state.busy||state.refreshing||!!state.error} label={w("Обновить образец симулятора", "Симулятордун үлгүсүн жаңыртуу")} onPress={()=>void workspace.sample()}/>}
      </Panel>}

      {(tab==="home"||tab==="device")&&<Panel style={{gap:12,padding:24,backgroundColor:theme.raised}}>
        <Copy muted size={14}>{tab==="device"?w("Мощность канала сейчас", "Каналдын учурдагы кубаты"):w("Мощность сейчас", "Учурдагы кубат")}</Copy>
        <View style={{flexDirection:"row",alignItems:"baseline",gap:8,flexWrap:"wrap"}}><Copy size={56} style={{fontWeight:"700",letterSpacing:-2}}>{fresh?(tab==="device"?channelWatts(snapshot.channels.find(ch=>ch.id===id),locale):snapshot.total_watts===null?"—":number(snapshot.total_watts,locale)):"—"}</Copy><Copy size={22} muted>{w("Вт", "Вт")}</Copy></View>
        <Copy muted size={14}>{fresh?w("Серверная симуляция · не показания ESP32", "Сервердик симуляция · ESP32 көрсөткүчү эмес"):w("Нет свежего измерения · управление отключено", "Жаңы өлчөө жок · башкаруу өчүрүлгөн")}</Copy>
        <Copy muted size={14}>{w("Обновлено", "Жаңыртылды")} {stamp(snapshot.measured_at,locale)}</Copy>
        {tab==="home"&&<>
          <View style={s.meter} accessible accessibilityLabel={`${w("Мощность", "Кубат")} ${fresh?snapshot.total_watts:"—"} / ${snapshot.peak_watts} Вт`}>
            <View style={[s.meterFill,{width:`${fresh?Math.min(100,(snapshot.total_watts??0)/snapshot.peak_watts*100):0}%`}]}/>
          </View>
          <View style={s.between}><Copy muted size={14}>{w("Предел", "Чек")} {number(snapshot.peak_watts,locale)} Вт</Copy><Copy accent size={14}>{fresh&&snapshot.total_watts!==null?`${w("Запас", "Калдык")} ${number(Math.max(0,snapshot.peak_watts-snapshot.total_watts),locale)} Вт`:w("Нет свежих данных", "Жаңы маалымат жок")}</Copy></View>
          <CTA secondary label={fresh?w("Управлять устройствами", "Түзмөктөрдү башкаруу"):w("Проверить данные", "Маалыматты текшерүү")} onPress={()=>router.replace("/devices")}/>
        </>}
      </Panel>}
      {tab==="home"&&<PowerHistory rows={state.measurements} locale={locale} nowSeconds={now/1000}/>}
      {tab==="autopilot"&&<>
        <Panel style={{gap:12,backgroundColor:theme.raised}}><Copy muted size={14}>{w("ДОСТУП К АВТОМАТИЗАЦИИ", "АВТОМАТТАШТЫРУУГА УРУКСАТ")}</Copy><Copy size={36} style={{fontWeight:"700"}}>{snapshot.channels.filter(ch=>!ch.protected&&ch.assigned.allow_auto).length} / 2</Copy><Copy size={22}>{w("Правила управления", "Башкаруунун эрежелери")}</Copy><Copy muted>{w("Вы решаете, какие каналы могут участвовать в расписаниях. Сервер проверяет разрешение, лимит мощности и ручной приоритет перед каждой командой.", "Графикке катышкан каналдарды сиз тандайсыз. Сервер ар бир буйруктун алдында уруксатты, кубат чегин жана кол артыкчылыгын текшерет.")}</Copy><Copy>{w("Предел мощности", "Кубат чеги")}: {number(snapshot.peak_watts,locale)} {w("Вт", "Вт")}</Copy><Copy>{w("Ручной приоритет", "Кол артыкчылыгы")}: {snapshot.manual_priority_minutes??"—"} {w("мин", "мүн")}</Copy></Panel>
        {snapshot.channels.map(ch=><Panel key={ch.id} style={{gap:12}}><View style={s.source}><Icon name={ch.protected?"shield":"pulse"} size={20} color={theme.peach}/><Copy size={19} style={{flex:1}}>{ch.id} · {ch.assigned.name}</Copy></View>{ch.protected?<Copy accent>{w("Защищён · исключён из расписаний", "Корголгон · графиктерге кирбейт")}</Copy>:<><Copy>{ch.assigned.allow_auto?w("Автоматизация разрешена владельцем", "Ээси автоматташтырууга уруксат берди"):w("Разрешение автоматизации не дано", "Автоматташтырууга уруксат берилген жок")}</Copy><Copy muted size={14}>{ch.manual_until===undefined?w("Ручной приоритет неизвестен", "Кол артыкчылыгы белгисиз"):ch.manual_until>now/1000?`${w("Ручной приоритет до", "Кол артыкчылыгы")} ${stamp(ch.manual_until,locale)}`:w("Активного ручного приоритета нет", "Активдүү кол артыкчылыгы жок")}</Copy><ConsentControl key={`${snapshot.controller_id}-${ch.id}-${ch.assigned.allow_auto}`} channel={ch} locale={locale} disabled={state.busy||state.refreshing||waiting||!!state.error} onChange={allowed=>void workspace.consent(ch.id,allowed)}/></>}</Panel>)}
        <CTA label={w("Открыть План", "Планды ачуу")} onPress={()=>router.replace("/plan")}/>
      </>}
      {tab==="plan"&&scheduler&&<><Panel style={{gap:8,backgroundColor:theme.raised}}><Copy size={22}>{w("Нагрузка в удобное время", "Жүк ыңгайлуу убакта")}</Copy><Copy muted>{w("Выберите канал и время. Сначала проверьте условия, затем подтвердите расписание. CH3 всегда защищён.", "Каналды жана убакытты тандаңыз. Адегенде шарттарды текшерип, андан соң графикти ырастоо керек. CH3 дайыма корголгон.")}</Copy></Panel><ServerSchedules key={`${snapshot.controller_id}-${plannedChannel}`} initialChannel={plannedChannel==="CH2"?"CH2":"CH1"} api={scheduler} controllerId={snapshot.controller_id} locale={locale} onChanged={()=>{if(workspace.getState().client===state.client&&workspace.getState().selectedId===snapshot.controller_id)return workspace.refresh();}} onSessionExpired={()=>{if(workspace.getState().client===state.client)workspace.expire();}}/></>}
      {(tab==="home"||tab==="devices"||tab==="device")&&<>
        {tab==="home"&&<Copy size={21}>{w("Каналы контроллера", "Контроллердин каналдары")}</Copy>}
        {tab==="devices"&&<View style={s.between}>{[["all",w("Все", "Баары")],["active",w("Активные", "Активдүү")],["protected",w("Защищённые", "Корголгон")]].map(([key,label])=><Pressable key={key} accessibilityRole="button" accessibilityState={{selected:deviceFilter===key}} style={[s.filter,deviceFilter===key&&s.selected]} onPress={()=>setDeviceFilter(key)}><Copy size={14}>{label}</Copy></Pressable>)}</View>}
        {snapshot.channels.filter(ch=>(tab!=="device"||ch.id===id)&&(tab!=="devices"||deviceFilter==="all"||(deviceFilter==="protected"?ch.protected:fresh&&ch.watts!==null&&ch.watts>0))).map(channel=><Panel key={channel.id} style={{gap:16}}>
          <Pressable accessibilityRole={tab!=="device"?"button":undefined} accessibilityLabel={`${channel.id} · ${w("Подробнее", "Кененирээк")}`} disabled={tab==="device"} onPress={()=>router.push(`/device?id=${channel.id}`)} style={{flexDirection:"row",gap:16,alignItems:"center",minHeight:80}}>
            <DeviceVisual id={channel.id} assignment={assignment(channel)} style={{width:64,height:80,borderRadius:12,backgroundColor:theme.raised}}/>
            <View style={{flex:1,gap:4}}><Copy size={18}>{channel.assigned.name}</Copy><Copy muted size={14}>{channel.id} · {channel.assigned.room||w("Без комнаты", "Бөлмө жок")}</Copy><Copy size={24} style={{fontWeight:"700"}}>{fresh?channelWatts(channel,locale):"—"} {w("Вт", "Вт")}</Copy><Copy muted size={14}>{!fresh?w("Нет свежих данных", "Жаңы маалымат жок"):(channel.watts??0)>0?w("Включён", "Күйүп турат"):w("Выключен", "Өчүрүлгөн")}</Copy></View>
            {tab!=="device"&&<Icon name="next" size={18}/>}
          </Pressable>
          {channel.protected?<View style={s.source}><Icon name="shield" size={20} color={theme.peach}/><Copy size={14}>{w("CH3 защищён · только наблюдение", "CH3 корголгон · байкоо гана")}</Copy></View>:<>
            {tab!=="home"&&<CTA disabled={disabled} secondary label={`${channel.id} · ${(channel.watts??0)>0?w("Запросить выключение", "Өчүрүүнү суроо"):w("Запросить включение", "Күйгүзүүнү суроо")}`} onPress={()=>void workspace.command(channel.id,!(channel.watts!>0))}/>}
            {tab==="device"&&<><Copy muted>{w("Автоматизация требует отдельного разрешения владельца. Ручной приоритет проверяется сервером.", "Автоматташтыруу үчүн ээсинин өзүнчө уруксаты керек. Кол артыкчылыгын сервер текшерет.")}</Copy><ConsentControl key={`${snapshot.controller_id}-${channel.id}-${channel.assigned.allow_auto}`} channel={channel} locale={locale} disabled={state.busy||state.refreshing||waiting||!!state.error} onChange={allowed=>void workspace.consent(channel.id,allowed)}/><CTA secondary label={w("Расписание канала", "Каналдын графиги")} onPress={()=>router.push(`/plan?channel=${channel.id}`)}/></>}
          </>}
          {tab==="device"&&<Copy muted size={14}>{w("Образец", "Үлгү")}: {stamp(snapshot.measured_at,locale)} · {w("Источник — симулятор", "Булак — симулятор")}</Copy>}
        </Panel>)}
        {tab==="devices"&&deviceFilter==="active"&&(!fresh||!snapshot.channels.some(ch=>ch.watts!==null&&ch.watts>0))&&<Panel><Copy muted>{fresh?w("Сейчас нет активных каналов", "Азыр активдүү канал жок"):w("Активность неизвестна без свежих данных", "Жаңы маалыматсыз активдүүлүк белгисиз")}</Copy></Panel>}
        {tab==="device"&&!snapshot.channels.some(ch=>ch.id===id)&&<Copy>{w("Канал не найден", "Канал табылган жок")}</Copy>}
      </>}
      {tab==="device"&&["CH1","CH2","CH3"].includes(id)&&<PowerHistory rows={state.measurements} locale={locale} nowSeconds={now/1000} channel={id as ServerChannel["id"]}/>}
      {(tab==="home"||tab==="devices"||tab==="device"||tab==="journal")&&state.commands.length>0&&<>
        <Copy size={21}>{w("Последние команды", "Акыркы буйруктар")}</Copy>
        {state.commands.filter(command=>tab!=="journal"||eventMatches(`command.${command.status}`,filter,command.origin)).slice(0,tab==="journal"?10:1).map(command=><Panel key={command.id} style={{gap:8}}>
          <Copy>{command.channel_id} · {command.on?w("Включить", "Күйгүзүү"):w("Выключить", "Өчүрүү")}</Copy>
          <Copy accent accessibilityLiveRegion="polite">{commandStatus(command.status,locale)}</Copy>
          <Copy muted size={14}>{stamp(command.transitions.at(-1)?.at??snapshot.measured_at,locale)}</Copy>
          <Details label={w("История выполнения", "Аткаруу тарыхы")}>{command.transitions.map((transition,i)=><Copy key={i} muted size={14}>{commandStatus(transition.status,locale)} · {stamp(transition.at,locale)}</Copy>)}<Copy muted size={14}>{command.id}</Copy></Details>
          {!!command.reason&&<Copy muted size={14}>{errorText(command.reason,locale)}</Copy>}

        </Panel>)}
      </>}
      {tab==="journal"&&<>
        <Copy size={21}>{w("События сервера", "Сервердин окуялары")}</Copy>
        <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{[["all","Все","Баары"],["manual","Ручные","Кол менен"],["autopilot","Автопилот","Автопилот"],["errors","Ошибки","Каталар"]].map(([key,ru,ky])=><Pressable key={key} accessibilityRole="button" accessibilityState={{selected:filter===key}} style={[s.filter,filter===key&&{borderColor:theme.peach}]} onPress={()=>{setFilter(key);setEventLimit(20);}}><Copy size={14}>{w(ru,ky)}</Copy></Pressable>)}</View>
        <Copy muted size={14}>{w("SIMULATOR · события по порядку получения. Время местное. Последние 500 записей.", "SIMULATOR · окуялар алуу тартибинде. Жергиликтүү убакыт. Акыркы 500 жазуу.")}</Copy>
        {state.events.filter(e=>eventMatches(e.kind,filter,state.commands.find(c=>c.id===e.command_id)?.origin)).length===0&&<Panel><Copy muted>{w("Нет событий для этого фильтра", "Бул чыпкада окуя жок")}</Copy></Panel>}
        {[...state.events].reverse().filter(e=>eventMatches(e.kind,filter,state.commands.find(c=>c.id===e.command_id)?.origin)).slice(0,eventLimit).map(event=><Panel key={event.sequence} style={{gap:8}}><Copy>{eventTitle(event.kind,locale)}{event.channel_id?` · ${event.channel_id}`:""}</Copy><Copy muted size={14}>{stamp(event.created_at,locale)}</Copy>{!!event.reason&&<Copy muted size={14}>{errorText(event.reason,locale)}</Copy>}<Details label={w("Сведения о событии", "Окуя жөнүндө маалымат")}><Copy muted size={14}>#{event.sequence} · SIMULATOR</Copy>{!!event.command_id&&<Copy muted size={14}>{event.command_id}</Copy>}<Copy muted size={14}>{event.kind}</Copy></Details></Panel>)}
        {state.events.filter(e=>eventMatches(e.kind,filter,state.commands.find(c=>c.id===e.command_id)?.origin)).length>eventLimit&&<CTA secondary label={w("Показать ещё 20 событий", "Дагы 20 окуяны көрсөтүү")} onPress={()=>setEventLimit(limit=>limit+20)}/>}
        <CTA secondary disabled={state.refreshing} label={w("Загрузить следующие события", "Кийинки окуяларды жүктөө")} onPress={()=>void workspace.refresh()}/>
      </>}
      {(tab==="devices"||tab==="device")&&<Panel style={{gap:12,backgroundColor:theme.raised}}>
        <Copy size={20}>{w("Проверка симулятора", "Симуляторду текшерүү")}</Copy><Copy muted>{w("Запрос не меняет показания. Подтверждение создаёт только отдельный шаг серверного симулятора.", "Суроо көрсөткүчтү өзгөртпөйт. Сервердик симулятордун өзүнчө кадамы гана ырастайт.")}</Copy>
        <CTA disabled={state.busy||state.refreshing||state.uncertain||!state.commands.some(c=>c.status==="requested")} label={w("Симулировать подтверждение", "Ырастоону симуляциялоо")} onPress={()=>void workspace.step()}/>
        <CTA secondary disabled={state.busy||state.refreshing} label={w("Создать образец симулятора", "Симулятордун үлгүсүн түзүү")} onPress={()=>void workspace.sample()}/>
        <Copy muted size={14}>{w("Образец повторяет последние значения. Он не опрашивает ESP32 и не подтверждает команды.", "Үлгү акыркы маанилерди кайталайт. Ал ESP32ни сурамжылабайт жана буйруктарды ырастабайт.")}</Copy>
      </Panel>}
    </>}

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
function eventMatches(kind:string,filter:string,origin?:string) {return filter==="all"||(filter==="errors"?/reject|timeout|error|fail/.test(kind):filter==="autopilot"?/schedule|auto/.test(kind)||origin==="schedule"||origin==="autopilot":origin==="manual");}
function eventTitle(kind:string,locale:Locale) {
  const labels:Record<string,[string,string]>={"simulator.created":["Контроллер создан","Контроллер түзүлдү"],"telemetry.simulated":["Получен образец","Үлгү алынды"],"command.requested":["Команда запрошена","Буйрук суралды"],"command.sent":["Команда отправлена","Буйрук жөнөтүлдү"],"command.acknowledged":["Подтверждение симулятора","Симулятордун ырастоосу"],"command.rejected":["Команда отклонена","Буйрук четке кагылды"],"command.timeout":["Нет подтверждения команды","Буйруктун ырастоосу жок"],"command.transport-error":["Не удалось подтвердить передачу","Жөнөтүүнү ырастоо мүмкүн эмес"],"command.reconciled":["Результат команды сверен","Буйруктун жыйынтыгы текшерилди"],"schedule.created":["Расписание создано","График түзүлдү"],"schedule.cancelled":["Расписание отменено","График жокко чыгарылды"],"assignment.updated":["Разрешения и назначение обновлены","Уруксаттар жана дайындоо жаңыртылды"]};
  return labels[kind]?.[locale==="ky"?1:0]??(locale==="ky"?"Контроллердин окуясы":"Событие контроллера");
}
function errorText(code:string,locale:Locale) {
  const w=(ru:string,ky:string)=>locale==="ky"?ky:ru;
  if(/401|session|authentication/.test(code))return w("Сеанс истёк. Войдите заново.", "Сеанс аяктады. Кайра кириңиз.");
  if(/network|timeout/.test(code))return w("Нет ответа сервера. Проверьте соединение; данные могут быть устаревшими.", "Серверден жооп жок. Байланышты текшериңиз; маалымат эски болушу мүмкүн.");
  if(/429|rate_limited/.test(code))return w("Слишком много запросов. Подождите минуту и обновите данные.", "Суроо өтө көп. Бир мүнөт күтүп, маалыматты жаңыртыңыз.");
  if(/404|403|not_found/.test(code))return w("Объект недоступен или удалён. Выберите контроллер заново.", "Объект жеткиликсиз же өчүрүлгөн. Контроллерди кайра тандаңыз.");
  if(/^http_5|server_busy/.test(code))return w("Сервер временно недоступен. Команды автоматически не повторяются.", "Сервер убактылуу жеткиликсиз. Буйруктар автоматтык кайталанбайт.");
  const labels:Record<string,[string,string]>={stale_measurements:["Нет свежего измерения. Создайте образец симулятора явно.","Жаңы өлчөө жок. Симулятордун үлгүсүн түзүңүз."],protected_channel:["CH3 защищён. Управление запрещено.","CH3 корголгон. Башкарууга тыюу салынат."],peak_exceeded:["Запрос превысит допустимый пик.","Суроо уруксат берилген чокудан ашат."],invalid_response:["Ответ сервера нарушает контракт. Данные не приняты.","Сервердин жообу келишимге туура келбейт. Маалымат кабыл алынган жок."],controller_not_found:["Контроллер удалён или недоступен. Выберите другой.","Контроллер өчүрүлгөн же жеткиликсиз. Башкасын тандаңыз."],simulator_confirmed:["Подтверждено серверным симулятором","Сервердик симулятор ырастады"]};
  return labels[code]?.[locale==="ky"?1:0]??w("Сервер не подтвердил действие. Обновите данные и проверьте условия.", "Сервер аракетти ырастаган жок. Маалыматты жаңыртып, шарттарды текшериңиз.");
}
function PowerHistory({rows,locale,nowSeconds,channel}:{rows:ServerMeasurement[];locale:Locale;nowSeconds:number;channel?:ServerChannel["id"]}) {
  const w=(ru:string,ky:string)=>locale==="ky"?ky:ru;
  const history=serverPowerHistory(rows.slice(-30),nowSeconds,60,channel);
  const points=history.points.map(point=>({t:point.at/1000,p:point.watts!}));
  const start=points[0]?.t??0,end=points.at(-1)?.t??start;
  const {observedPeak,ceiling:peak}=powerChartRange(points.map(point=>point.p));
  const x=(t:number)=>12+(t-start)/Math.max(1,end-start)*256,y=(p:number)=>108-p/peak*88;
  const gap=history.hasGap;
  return <Panel style={{gap:12}}><Copy size={20}>{w("История мощности", "Кубаттын тарыхы")}{channel?` · ${channel}`:""}</Copy><Copy muted size={14}>{w("Вт · образцы серверного симулятора", "Вт · сервердик симулятордун үлгүлөрү")}</Copy>
    {points.length<2?<Copy muted>{w("Нужно хотя бы два образца. История появится после явных действий симулятора.", "Кеминде эки үлгү керек. Тарых симулятордун аракеттеринен кийин чыгат.")}</Copy>:<>
      <Copy muted size={14}>{w("Пик в загруженной истории", "Жүктөлгөн тарыхтагы чоку")}: {number(observedPeak,locale)} {w("Вт", "Вт")}</Copy>
      <View accessible accessibilityLabel={points.map(p=>`${stamp(p.t,locale)}: ${number(p.p,locale)} Вт`).join("; ")}>
        <Svg width="100%" height={128} viewBox="0 0 280 128" aria-hidden={true} focusable={false}>
          <Line x1={12} x2={268} y1={108} y2={108} stroke={theme.line}/><Line x1={12} x2={268} y1={64} y2={64} stroke={theme.line} strokeDasharray="3 5"/><Line x1={12} x2={268} y1={20} y2={20} stroke={theme.line} strokeDasharray="3 5"/>
          {points.map((p,i)=><React.Fragment key={i}>{i>0&&p.t>points[i-1].t&&p.t-points[i-1].t<=60&&<Path d={`M${x(points[i-1].t)} ${y(points[i-1].p)} L${x(p.t)} ${y(p.p)}`} stroke={theme.peach} strokeWidth={2}/>}<Circle cx={x(p.t)} cy={y(p.p)} r={3} fill={theme.peach}/></React.Fragment>)}
        </Svg>
      </View><Copy muted size={14}>{stamp(start,locale)} → {stamp(end,locale)} · 0–{number(peak,locale)} {w("Вт", "Вт")}</Copy>
      {gap&&<Copy>{w("Есть разрывы более 60 с. Они не соединены.", "60 секунддан чоң үзгүлтүк бар. Алар бириктирилген жок.")}</Copy>}
      {history.summary.coveredMs>0&&<><Copy>{w("Оценка энергии симулятора", "Симулятордун энергия баалоосу")}: ≈ {history.summary.observedWh.toLocaleString(locale==="ky"?"ky-KG":"ru-RU",{maximumSignificantDigits:3})} Wh</Copy><Copy muted size={14}>{w("Трапецеидальная оценка только покрытых интервалов", "Камтылган аралыктардын гана трапециялык баалоосу")}: {Math.round(history.summary.coveredMs/1000)} {w("с", "с")} · {w("пропуски", "үзгүлтүк")}: {Math.round(history.summary.missingMs/1000)} {w("с", "с")}</Copy></>}
      {history.ignored>0&&<Copy muted size={14}>{w("Неиспользованные образцы", "Колдонулбаган үлгүлөр")}: {history.ignored}</Copy>}
    </>}
  </Panel>;
}
const s=StyleSheet.create({badge:{alignSelf:"flex-start",paddingHorizontal:12,paddingVertical:6,borderWidth:1,borderColor:theme.line,borderRadius:20,backgroundColor:theme.surface},between:{flexDirection:"row",justifyContent:"space-between",gap:8,flexWrap:"wrap"},selected:{borderColor:theme.peach,backgroundColor:theme.raised},meter:{height:6,borderRadius:3,backgroundColor:theme.bg,overflow:"hidden"},meterFill:{height:6,borderRadius:3,backgroundColor:theme.peach},source:{flexDirection:"row",alignItems:"center",gap:8,flexWrap:"wrap",flexShrink:1},controller:{minHeight:64,flexDirection:"row",alignItems:"center",gap:12,paddingVertical:8,borderBottomWidth:1,borderColor:theme.line},filter:{minHeight:48,paddingHorizontal:14,paddingVertical:12,borderRadius:24,borderWidth:1,borderColor:theme.line,justifyContent:"center"}});
