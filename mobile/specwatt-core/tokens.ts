/** Exact Warm Graphite design-system foundations from approved v2 source. */
export const warmGraphite = {
 colors:{background:'#222321',surface:'#2B2D2A',surfaceRaised:'#33342F',text:'#F4F1EA',muted:'#AAA79F',accent:'#FFB681',border:'#4E4C44'},
 fontFamily:'Manrope',
 radii:{tile:18,card:24,hero:28,pill:99},
 touchMin:48,
 space:{xs:4,sm:8,md:12,base:16,lg:24,xl:32},
} as const;
/** Native UI must use text labels as well as color for states; not a color-only distinction. */
export const measurementCopy={missing:'Нет данных',stale:'Данные устарели',unavailable:'Нет измерителя'} as const;
