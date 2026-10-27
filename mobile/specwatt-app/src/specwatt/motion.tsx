import React,{createContext,useContext,useEffect,useState} from 'react';
import {AccessibilityInfo,Platform,Pressable,PressableProps,StyleProp,ViewStyle,TextStyle,TextInput} from 'react-native';
import Animated,{cancelAnimation,Easing,FadeIn,ReduceMotion,useAnimatedProps,useAnimatedStyle,useSharedValue,withSpring,withTiming} from 'react-native-reanimated';
import {Path,Rect} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import {motion,motionDuration} from './motion-tokens';

const Context=createContext(true);
const AnimatedPressable=Animated.createAnimatedComponent(Pressable);
const AnimatedInput=Animated.createAnimatedComponent(TextInput);
const AnimatedPath=Animated.createAnimatedComponent(Path);
const AnimatedRect=Animated.createAnimatedComponent(Rect);
export function MotionProvider({children}:{children:React.ReactNode}){
 const [reduced,setReduced]=useState(true);
 useEffect(()=>{let live=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(live)setReduced(v);}).catch(()=>{});const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{live=false;listener.remove();};},[]);
 return <Context.Provider value={reduced}>{children}</Context.Provider>;
}
export function useMotion(){return useContext(Context);}
export function feedback(kind:'selection'|'confirm'|'reject'='selection',reduced=false){
 if(reduced||Platform.OS==='web')return;
 const action=Platform.OS==='android'?Haptics.performAndroidHapticsAsync(kind==='reject'?Haptics.AndroidHaptics.Reject:kind==='confirm'?Haptics.AndroidHaptics.Confirm:Haptics.AndroidHaptics.Segment_Tick):Haptics.selectionAsync();
 action.catch(()=>{});
}
export function MotionPressable({style,onPress,onPressIn,onPressOut,onHoverIn,onHoverOut,disabled,...props}:PressableProps){
 const reduced=useMotion(),scale=useSharedValue(1);
 const [pressed,setPressed]=useState(false),[hovered,setHovered]=useState(false);
 // Reanimated normalizes style to an array before native Pressable sees it.
 // Resolve the state callback here so Yoga receives dimensions and positioning.
 const animated=useAnimatedStyle(()=>({transform:[{scale:scale.value}]}));
 useEffect(()=>{if(disabled||reduced){cancelAnimation(scale);scale.set(1);}return()=>cancelAnimation(scale);},[disabled,reduced,scale]);
 return <AnimatedPressable {...props} disabled={disabled} onHoverIn={e=>{setHovered(true);onHoverIn?.(e);}} onHoverOut={e=>{setHovered(false);onHoverOut?.(e);}} onPressIn={e=>{setPressed(true);cancelAnimation(scale);scale.set(withTiming(reduced?1:motion.pressScale,{duration:motionDuration('fast',reduced),reduceMotion:ReduceMotion.System}));onPressIn?.(e);}} onPressOut={e=>{setPressed(false);cancelAnimation(scale);scale.set(withSpring(1,{...motion.spring,reduceMotion:ReduceMotion.System}));onPressOut?.(e);}} onPress={e=>{feedback('selection',reduced);onPress?.(e);}} style={[typeof style==='function'?style({pressed:pressed&&!disabled,hovered:hovered&&!disabled}):style,animated]}/>;
}
export function Reveal({children,style}:{children:React.ReactNode;style?:StyleProp<ViewStyle>}){const reduced=useMotion();return <Animated.View entering={reduced?undefined:FadeIn.duration(motion.duration.standard).reduceMotion(ReduceMotion.System)} style={style}>{children}</Animated.View>;}
export function AnimatedMetric({value,style,accessibilityLabel}:{value:number|null;style?:StyleProp<TextStyle>;accessibilityLabel:string}){
 const reduced=useMotion(),current=useSharedValue(value??0);
 useEffect(()=>{cancelAnimation(current);current.set(withTiming(value??0,{duration:motionDuration('metric',reduced),easing:Easing.out(Easing.cubic),reduceMotion:ReduceMotion.System}));return()=>cancelAnimation(current);},[value,reduced,current]);
 const animated=useAnimatedProps(()=>({text:value===null?'—':current.value.toFixed(1).replace('.',','),defaultValue:value===null?'—':current.value.toFixed(1).replace('.',',')}));
 return <AnimatedInput accessible accessibilityLabel={accessibilityLabel} editable={false} caretHidden pointerEvents='none' underlineColorAndroid='transparent' value={undefined} defaultValue={value===null?'—':value.toFixed(1).replace('.',',')} animatedProps={animated} style={[{padding:0,margin:0,fontVariant:['tabular-nums']},style]}/>;
}
export function TracePath({progress=1,length=450,...props}:React.ComponentProps<typeof Path>&{progress?:number;length?:number}){
 const reduced=useMotion(),p=useSharedValue(reduced?progress:0);
 useEffect(()=>{cancelAnimation(p);p.set(withTiming(progress,{duration:motionDuration('chart',reduced),easing:Easing.out(Easing.cubic),reduceMotion:ReduceMotion.System}));return()=>cancelAnimation(p);},[progress,p,reduced]);
 const animatedProps=useAnimatedProps(()=>({strokeDashoffset:length*(1-p.value)}));
 return <AnimatedPath {...props} strokeDasharray={`${length} ${length}`} animatedProps={animatedProps}/>;
}
export function ChartBar({height,baseline=68,...props}:React.ComponentProps<typeof Rect>&{height:number;baseline?:number}){
 const reduced=useMotion(),h=useSharedValue(reduced?height:0);
 useEffect(()=>{cancelAnimation(h);h.set(withTiming(height,{duration:motionDuration('chart',reduced),easing:Easing.out(Easing.cubic),reduceMotion:ReduceMotion.System}));return()=>cancelAnimation(h);},[height,h,reduced]);
 const animatedProps=useAnimatedProps(()=>({y:baseline-h.value,height:h.value}));
 return <AnimatedRect {...props} animatedProps={animatedProps}/>;
}
export function AnimatedSelection({selected,children,style}:{selected:boolean;children:React.ReactNode;style?:StyleProp<ViewStyle>}){
 const reduced=useMotion(),t=useSharedValue(selected?1:0);
 useEffect(()=>{cancelAnimation(t);t.set(withTiming(selected?1:0,{duration:motionDuration('standard',reduced),reduceMotion:ReduceMotion.System}));return()=>cancelAnimation(t);},[selected,t,reduced]);
 const animated=useAnimatedStyle(()=>({backgroundColor:`rgba(255,172,112,${t.value})`,transform:[{scale:1+t.value*.02}]}));
 return <Animated.View style={[style,animated]}>{children}</Animated.View>;
}
export function useToggleMotion(value:boolean){
 const reduced=useMotion(),t=useSharedValue(value?1:0);
 useEffect(()=>{cancelAnimation(t);t.set(withSpring(value?1:0,{...motion.spring,reduceMotion:ReduceMotion.System}));return()=>cancelAnimation(t);},[value,t,reduced]);
 const thumb=useAnimatedStyle(()=>({transform:[{translateX:t.value*30}]}));
 return {thumb,reduced};
}
