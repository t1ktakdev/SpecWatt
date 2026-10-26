/**
 * SpecWATT mobile-domain foundation — pure TypeScript (React Native safe).
 * No network, BLE, ESP32, email or backend calls are made by this module.
 */
export type Source = 'demo' | 'live';
export type Freshness = 'fresh' | 'stale' | 'missing';
export type CommandStatus = 'requested'|'sent'|'acknowledged'|'rejected'|'timeout'|'transport-error'|'reconciled';
export interface Capabilities { relay:boolean; meter:boolean; manual:boolean }
export interface Channel {
 id:string; label:string; controllerId:string;
 protected:boolean; connected:boolean; freshness:Freshness;
 confirmed:boolean | null; powerW:number | null; nominalW:number | null;
 allowAuto:boolean; capabilities:Capabilities;
}
export interface DeviceAssignment {id:string; channelId:string; name:string; categoryId:string; imageId:string|null;roomId:string|null}
export interface Command {id:string;channelId:string;target:boolean;confirmedBefore:boolean|null;status:CommandStatus;source:Source}
export interface SpecWattState {
 source:Source; controllers:{id:string;connected:boolean;simulated:boolean}[];
 channels:Channel[]; devices:DeviceAssignment[]; commands:Command[];
 autoConsent:boolean;
}
export function emptyState():SpecWattState {
 return {source:'live',controllers:[],channels:[],devices:[],commands:[],autoConsent:false};
}
export function demoState():SpecWattState {
 const s:SpecWattState={...emptyState(),source:'demo'};
 s.controllers=[{id:'demo-controller',connected:true,simulated:true}];
 const basic={controllerId:'demo-controller',connected:true,freshness:'fresh' as Freshness,allowAuto:false,capabilities:{relay:true,meter:true,manual:true}};
 s.channels=[
  {...basic,id:'CH1',label:'CH1',protected:false,confirmed:true,powerW:1.8,nominalW:1.8},
  {...basic,id:'CH2',label:'CH2',protected:false,confirmed:false,powerW:0,nominalW:4.2},
  {...basic,id:'CH3',label:'CH3',protected:true,confirmed:true,powerW:2.4,nominalW:2.4},
 ];
 s.devices=[
  {id:'demo-lamp',channelId:'CH1',name:'Светильник',categoryId:'lamp',imageId:'lamp',roomId:null},
  {id:'demo-led',channelId:'CH2',name:'LED-лента',categoryId:'led-strip',imageId:'led-strip',roomId:null},
  {id:'demo-fan',channelId:'CH3',name:'Вентилятор',categoryId:'fan',imageId:'fan',roomId:null},
 ];
 return s;
}
export function totalPower(s:SpecWattState):number|null {
 if(!s.channels.length)return null;
 for(const c of s.channels){
  const ctr=s.controllers.find(x=>x.id===c.controllerId);
  if(!ctr?.connected||!c.connected||c.freshness!=='fresh'||!c.capabilities.meter||c.powerW===null||!Number.isFinite(c.powerW))return null;
 }
 return Math.round(s.channels.reduce((sum,c)=>sum+(c.powerW??0),0)*1000)/1000;
}
export function requestCommand(s:SpecWattState,channelId:string,target:boolean,id:string):SpecWattState {
 const c=s.channels.find(c=>c.id===channelId);
 if(!c)throw new Error('channel-missing');
 if(c.protected)throw new Error('protected');
 if(!c.capabilities.relay||!c.capabilities.manual)throw new Error('unsupported');
 if(c.freshness!=='fresh')throw new Error('stale');
 if(!c.connected||!s.controllers.find(x=>x.id===c.controllerId)?.connected)throw new Error('disconnected');
 if(!id||s.commands.some(c=>c.id===id))throw new Error('duplicate-command');
 if(s.commands.some(x=>x.channelId===channelId&&['requested','sent','timeout','transport-error'].includes(x.status)))throw new Error('unresolved-command');
 return {...s,commands:[...s.commands,{id,channelId,target,confirmedBefore:c.confirmed,status:'requested',source:s.source}]};
}
export function acknowledgeCommand(s:SpecWattState,id:string,powerW:number|null):SpecWattState {
 const cmd=s.commands.find(c=>c.id===id);
 if(!cmd)throw new Error('command-missing');
 if(['acknowledged','reconciled','rejected'].includes(cmd.status))return s;
 const channel=s.channels.find(c=>c.id===cmd.channelId);
 if(!channel)throw new Error('channel-missing');
 if(powerW!==null&&(!Number.isFinite(powerW)||powerW<0))throw new Error('measurement-invalid');
 return {...s,channels:s.channels.map(c=>c.id===cmd.channelId?{...c,confirmed:cmd.target,powerW:c.capabilities.meter?powerW:null,freshness:powerW===null?'missing':'fresh'}:c),commands:s.commands.map(c=>c.id===id?{...c,status:'acknowledged'}:c)};
}
export function exitDemo(s:SpecWattState):SpecWattState {if(s.source!=='demo')return s;return emptyState();}
