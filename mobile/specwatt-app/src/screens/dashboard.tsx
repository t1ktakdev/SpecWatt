import React, { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { DeviceVisual } from "../specwatt/device-visual";
import { MotionPressable as Pressable } from "../specwatt/motion";
import { Copy } from "../specwatt/ui";
import { useSpec, totalPower, Channel } from "../specwatt/store";
import { theme } from "../specwatt/theme";
import { Shell, Header, Brand, Gauge, HistoryChart, RowLink, Chips, Empty, Toggle, Icon, formatW, useWords, s } from "../specwatt/mobile-ui";

export function HomeScreen() {
  const { data } = useSpec();
  const w = useWords(), {width,fontScale}=useWindowDimensions();
  const stacked=width<360||fontScale>1.2;
  const power=totalPower(data.channels);
  return <Shell active="/home">
    <Header title={<Brand/>} subtitle={w("Учебный стенд · ","Окуу стенди · ")+(data.source==="demo"?w("Демо","Демо"):w("Нет контроллера","Контроллер жок"))}/>
    {data.channels.length?<>
      <Gauge label={w("Текущая мощность","Учурдагы кубат")} power={power} limit={data.peak} value={`${formatW(power)} Вт`} subtitle={power===null?w("Нет свежих измерений","Жаңы өлчөөлөр жок"):`${w("Лимит","Чек")} ${formatW(data.peak)} Вт · ${w("Демо","Демо")}`}/>
      <HistoryChart/>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Copy size={20}>{w("Устройства","Түзмөктөр")}</Copy><Copy muted size={13}>{data.channels.length} {w("канала","канал")}</Copy></View>
      <View style={{flexDirection:stacked?'column':'row',gap:12}}>
        {data.channels.filter(c=>!c.protected).map(ch=><View key={ch.id} style={{flex:1,minWidth:0}}><DeviceCard channel={ch} compact={!stacked}/></View>)}
      </View>
      {data.channels.filter(c=>c.protected).map(ch=><DeviceCard key={ch.id} channel={ch}/>)}
      <RowLink icon="bolt" title={`${w("Автопилот","Автопилот")} ${data.autopilot?w("включён","күйүк"):w("выключен","өчүк")}`} subtitle={w("Разрешения, лимит и план нагрузки","Уруксаттар, чек жана жүктөм планы")} accent onPress={()=>router.replace("/autopilot")}/>
    </>:<Empty/>}
  </Shell>;
}
export function DevicesScreen() {
  const {data}=useSpec(),w=useWords();
  const [filter,setFilter]=useState(0);
  const channels=data.channels.filter(c=>filter===1?c.freshness==='fresh'&&c.watts!==null&&c.watts>0:filter===2?c.protected:true);
  return <Shell active="/devices">
    <Header title={w("Устройства","Түзмөктөр")} subtitle={data.source==='demo'?w(`Учебный стенд · ${data.channels.length} канала · Демо`,`Окуу стенди · ${data.channels.length} канал · Демо`):w("Нет подключённых каналов","Туташкан каналдар жок")} icon="plus" onPress={()=>router.push("/setup")}/>
    <Chips items={[w("Все","Баары"),w("Активные","Активдүү"),w("Защищённые","Корголгон")]} selected={filter} onSelect={setFilter}/>
    {channels.map(ch=><DeviceCard key={ch.id} channel={ch}/>)}
    {!channels.length&&(data.channels.length?<Copy muted>{w("В этом фильтре нет устройств.","Бул чыпкада түзмөктөр жок.")}</Copy>:<Empty/>)}
    {data.source==='demo'&&<Copy muted size={12}>{w("Демо · виртуальные каналы, не физические измерения","Демо · виртуалдык каналдар, чыныгы өлчөөлөр эмес")}</Copy>}
  </Shell>;
}

/** Navigation and channel control are siblings: no nested press dispatch. */
export function DeviceCard({channel:ch,compact=false}:{channel:Channel;compact?:boolean}) {
  const {toggleChannel}=useSpec(),w=useWords();
  const {width,fontScale}=useWindowDimensions();
  const unknown=ch.watts===null||ch.freshness!=='fresh';
  const name=ch.assigned?.name||w("Не назначен","Дайындалган эмес");
  const status=ch.freshness==='stale'?w("Нет свежих измерений","Жаңы өлчөөлөр жок"):unknown?w("Нет измерений","Өлчөөлөр жок"):ch.protected?w("Защищён","Корголгон"):(ch.watts ?? 0)>0?w("Включён","Күйүк"):w("Выключен","Өчүк");
  const stacked=compact||width<360||fontScale>1.2;
  const open=()=>router.push({pathname:"/device",params:{id:ch.id}});
  return <View style={[s.card,{padding:0}]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${name} · ${w("Подробнее","Кененирээк")}`} onPress={open} style={{padding:16,gap:12}}>
      <View style={{flexDirection:'row',gap:8,alignItems:'center'}}><Copy size={compact?17:22} style={{flex:1}}>{name}</Copy><Icon name="next" size={18}/></View>
      <View style={{flexDirection:stacked?'column':'row',alignItems:stacked?'stretch':'center',gap:12}}>
        <DeviceVisual scene assignment={ch.assigned} id={ch.id} style={{height:compact?116:132,width:stacked?'100%':112,borderRadius:14}}/>
        <View style={{flex:1,gap:6}}>
          <Copy size={12} muted>{ch.id}{ch.assigned?.room?` · ${ch.assigned.room}`:''}</Copy>
          <Copy size={13} accent={!unknown&&(ch.protected||(ch.watts ?? 0)>0)} muted={unknown}>{status}</Copy>
          {!compact&&<Copy size={32}>{formatW(unknown?null:ch.watts)} <Copy size={16}>Вт</Copy></Copy>}
          {ch.freshness==='stale'&&ch.watts!==null&&<Copy size={12} muted>{w("Последнее значение","Акыркы маани")}: {formatW(ch.watts)} Вт</Copy>}
        </View>
      </View>
    </Pressable>
    <View style={{borderTopWidth:1,borderColor:theme.line,paddingHorizontal:16,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:12}}>
      <View style={{flex:1}}>{compact?<Copy size={22}>{formatW(unknown?null:ch.watts)} <Copy size={13}>Вт</Copy></Copy>:<Copy size={12} muted>{ch.protected?w("Только наблюдение · CH3","Байкоо гана · CH3"):w("Ручное управление · Демо","Кол башкаруу · Демо")}</Copy>}</View>
      {ch.protected?<Icon name="shield" size={24} color={theme.peach}/>:<Toggle label={`${w("Переключить","Которуу")} ${name}`} value={!unknown&&(ch.watts ?? 0)>0} disabled={unknown} onChange={()=>toggleChannel(ch.id)}/>}
    </View>
  </View>;
}
