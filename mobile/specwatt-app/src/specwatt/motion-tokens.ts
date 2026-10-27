/** Calm physical responses. All interactions can settle immediately when motion is reduced. */
export const motion = {
 duration: { instant:80, fast:140, standard:220, reveal:360, metric:300, chart:480 },
 spring: { damping:24, stiffness:280, mass:0.85, overshootClamping:true },
 pressScale:0.975,
 easing:[0.22,0.68,0,1] as const,
 cancellation:'restore-from-current-position' as const,
} as const;
export function motionDuration(kind:keyof typeof motion.duration,reduced:boolean){return reduced?0:motion.duration[kind];}
export function normalizedPower(value:number|null,limit:number):number|null{
 if(value===null||!Number.isFinite(value)||value<0||!Number.isFinite(limit)||limit<=0)return null;
 return Math.min(1,value/limit);
}
