import React,{useState} from 'react';
import {View} from 'react-native';
import {MotionPressable as Pressable} from '../specwatt/motion';
import {Copy,CTA} from '../specwatt/ui';
import {theme} from '../specwatt/theme';
import {Icon} from '../specwatt/mobile-ui';
import type {ServerChannel} from '../specwatt/api';
import type {Locale} from '../specwatt/model';

export function Details({label,children}:{label:string;children:React.ReactNode}) {
 const [expanded,setExpanded]=useState(false);
 return <View style={{gap:8}}>
  <Pressable accessibilityRole="button" accessibilityState={{expanded}} onPress={()=>setExpanded(value=>!value)} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:8}}>
   <Icon name={expanded?'back':'next'} size={16}/><Copy muted size={14} style={{flex:1}}>{label}</Copy>
  </Pressable>
  {expanded&&<View style={{gap:8,borderLeftWidth:2,borderColor:theme.line,paddingLeft:12}}>{children}</View>}
 </View>;
}

/** Granting permission is a two-step owner action. No synthetic global auto-mode. */
export function ConsentControl({channel,locale,disabled,onChange}:{channel:ServerChannel;locale:Locale;disabled:boolean;onChange:(allowed:boolean)=>void}) {
 const [confirm,setConfirm]=useState(false),w=(ru:string,ky:string)=>locale==='ky'?ky:ru;
 if(channel.protected)return null;
 return confirm&&!channel.assigned.allow_auto?<View style={{gap:12,padding:16,borderRadius:16,backgroundColor:theme.raised}}>
  <Copy size={18}>{w('Разрешить расписания?', 'Графиктерге уруксат берилсинби?')}</Copy>
  <Copy>{channel.id} · {channel.assigned.name}</Copy>
  <Copy muted>{w('Разрешение позволит серверу отправлять команды по вашим расписаниям. Лимит мощности и ручной приоритет сохраняются. CH3 исключён.', 'Уруксат серверге сиздин графиктериңиз боюнча буйрук жөнөтүүгө жол берет. Кубат чеги жана кол артыкчылыгы сакталат. CH3 кирбейт.')}</Copy>
  <CTA disabled={disabled} label={w('Подтвердить разрешение', 'Уруксатты ырастоо')} onPress={()=>{setConfirm(false);onChange(true);}}/>
  <CTA secondary label={w('Оставить без разрешения', 'Уруксатсыз калтыруу')} onPress={()=>setConfirm(false)}/>
 </View>:<CTA secondary disabled={disabled} label={channel.assigned.allow_auto?w('Запретить автоматизацию', 'Автоматташтырууга тыюу салуу'):w('Разрешить автоматизацию', 'Автоматташтырууга уруксат берүү')} onPress={()=>channel.assigned.allow_auto?onChange(false):setConfirm(true)}/>;
}
