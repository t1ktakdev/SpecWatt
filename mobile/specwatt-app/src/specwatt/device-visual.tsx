import React,{useState} from 'react';
import {Image,View,ViewStyle,StyleProp} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {DeviceIllustration,defaultIllustration} from './illustrations';
import type {Assign,ChannelId} from './model';
import {devicePhotoExists} from './photos';
import {validateAppearance} from './appearance-policy';
import {imageMap,ImageId} from './images';
export function defaultDeviceConfig(id?:ChannelId,image?:string){
 const category=image==='charger'?'phone-charger':image==='socket'?'smart-socket':id==='CH2'||image==='led-strip'?'led-strip':id==='CH3'||image==='fan'?'pc-fan':image==='appliance'?'kettle':'mushroom-lamp';
 return defaultIllustration(category);
}
export function DeviceVisual({assignment,id,style,scene=false}:{assignment?:Assign|null;id?:ChannelId;style?:StyleProp<ViewStyle>;scene?:boolean}){
 const [failedUri,setFailedUri]=useState('');
 const appearance=validateAppearance(assignment?.appearance);
 const photo=appearance?.kind==='photo'&&failedUri!==appearance.uri&&devicePhotoExists(appearance.uri)?appearance.uri:null;
 const bundled=!appearance&&assignment?.image&&Object.prototype.hasOwnProperty.call(imageMap,assignment.image)?imageMap[assignment.image as ImageId]:null;
 return <View pointerEvents='none' style={[{overflow:'hidden',alignItems:'center',justifyContent:'center'},style]}>
  {scene&&<LinearGradient colors={['#30271E','#211E18','#191D18']} style={{position:'absolute',inset:0}}/>}
  {photo||bundled?<Image source={photo?{uri:photo}:bundled!} style={{width:'100%',height:'100%'}} resizeMode='cover' accessibilityLabel={assignment?.name} onError={()=>{if(photo)setFailedUri(photo);}}/>:<DeviceIllustration config={appearance?.kind==='vector'?appearance.config:defaultDeviceConfig(id,assignment?.image)} width='100%' height='100%' accessibilityLabel={assignment?.name}/>}
 </View>;
}
