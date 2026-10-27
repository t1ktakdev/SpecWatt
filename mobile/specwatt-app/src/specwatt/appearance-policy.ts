import {validateIllustrationConfig} from './illustrations/catalog.ts';
import type {IllustrationConfig} from './illustrations/catalog.ts';
import {isPhotoUri} from './photo-policy.ts';
export type DeviceAppearance={kind:'vector';config:IllustrationConfig}|{kind:'photo';uri:string};
export function validateAppearance(value:unknown):DeviceAppearance|null{
 if(typeof value!=='object'||value===null||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 if(v.kind==='vector'&&Object.keys(v).every(k=>k==='kind'||k==='config')){const config=validateIllustrationConfig(v.config);return config?{kind:'vector',config}:null;}
 if(v.kind==='photo'&&Object.keys(v).every(k=>k==='kind'||k==='uri')&&isPhotoUri(v.uri))return {kind:'photo',uri:v.uri as string};
 return null;
}
